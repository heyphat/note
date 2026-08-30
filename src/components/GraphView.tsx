'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
    forceSimulation,
    forceLink,
    forceManyBody,
    forceX,
    forceY,
    forceCollide,
    type Simulation,
    type SimulationNodeDatum,
    type SimulationLinkDatum,
    type ForceLink,
    type ForceCollide,
} from 'd3-force';
import type { NoteMeta } from '@/lib/storage';
import type { LinkIndex } from '@/lib/links/link-index';
import { buildLinkResolver, resolveLink } from '@/lib/links/link-resolver';

interface Props {
    notes: NoteMeta[];
    // Kept in the API so the host doesn't need to build it again, but the
    // graph currently reads everything it needs from the notes array + resolver.
    notesById?: Map<string, NoteMeta>;
    linkIndex: LinkIndex | null;
    linksVersion: number;
    activeId: string | null;
    onSelect: (id: string) => void;
    onClose: () => void;
}

interface GNode extends SimulationNodeDatum {
    id: string;
    title: string;
    degree: number;
}

interface GLink extends SimulationLinkDatum<GNode> {
    source: string | GNode;
    target: string | GNode;
    isTransclusion: boolean;
}

const WIDTH = 1200;
const HEIGHT = 800;
const MIN_RADIUS = 3;
const MAX_RADIUS = 14;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function clampDegreeToRadius(degree: number, maxDegree: number): number {
    if (!maxDegree) return MIN_RADIUS;
    const t = Math.sqrt(degree / maxDegree);
    return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * t;
}

// Seed initial positions so the simulation starts spread out instead of
// piling everyone at (0,0). The forceX/forceY anchors below are weak
// enough (0.04 strength) that link/charge forces dominate locally, but
// strong enough to keep dragged-and-released nodes from drifting forever.
function linkedSeed(index: number): { x: number; y: number } {
    if (index === 0) return { x: WIDTH / 2, y: HEIGHT / 2 };
    const angle = index * GOLDEN_ANGLE;
    const radius = Math.min(140, 22 * Math.sqrt(index));
    return {
        x: WIDTH / 2 + Math.cos(angle) * radius,
        y: HEIGHT / 2 + Math.sin(angle) * radius,
    };
}

function isolatedSeed(index: number, total: number): { x: number; y: number } {
    if (total <= 1) return { x: WIDTH / 2 + 320, y: HEIGHT / 2 };
    // Pack isolated nodes onto rings hugging the linked cluster. The radii
    // are sized so the innermost ring sits clear of the typical linked-cluster
    // span (~300px) once the simulation settles.
    const perRing = Math.max(12, Math.ceil(total / 2.5));
    const ring = Math.floor(index / perRing);
    const indexInRing = index % perRing;
    const itemsInRing = Math.min(perRing, total - ring * perRing);
    const angle = -Math.PI / 2 + (indexInRing / itemsInRing) * Math.PI * 2 + ring * 0.18;
    return {
        x: WIDTH / 2 + Math.cos(angle) * Math.min(520, 340 + ring * 70),
        y: HEIGHT / 2 + Math.sin(angle) * Math.min(340, 230 + ring * 50),
    };
}

function edgeKey(source: string | GNode, target: string | GNode): string {
    const s = typeof source === 'string' ? source : source.id;
    const t = typeof target === 'string' ? target : target.id;
    return `${s}→${t}`;
}

function GraphView({
    notes,
    linkIndex,
    linksVersion,
    activeId,
    onSelect,
    onClose,
}: Props) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const innerGRef = useRef<SVGGElement | null>(null);
    const simRef = useRef<Simulation<GNode, GLink> | null>(null);
    // Persistent GNode store keyed by note id. Reused across useMemo
    // re-derivations so a node's x/y/vx/vy/fx/fy survive when the indexer
    // bumps `linksVersion` mid-drag.
    const nodeStoreRef = useRef<Map<string, GNode>>(new Map());
    // Cache of last useMemo *inputs*. linksVersion bumps every keystroke;
    // without this fast-path the resolver + edge iteration runs O(N+E) on
    // every spurious bump even though the short-circuit catches the result.
    const memoInputsRef = useRef<{
        notes: NoteMeta[];
        linkIndex: LinkIndex | null;
        linksVersion: number;
        hideIsolated: boolean;
    } | null>(null);
    const lastDerivedRef = useRef<{
        nodes: GNode[];
        links: GLink[];
        neighbors: Map<string, Set<string>>;
    } | null>(null);

    // Tick-time refs. Populated by the structure-update effect; read by the
    // tick handler that's bound once on mount. Decoupling sim creation from
    // sim updates is the key CPU win — we never recreate `forceSimulation`,
    // so we never trigger the alpha=1 re-warm storm that fired on every
    // legitimate edge addition/removal.
    const nodesArrRef = useRef<GNode[]>([]);
    const linksArrRef = useRef<GLink[]>([]);
    const nodeByIdRef = useRef<Map<string, SVGCircleElement>>(new Map());
    const labelByIdRef = useRef<Map<string, SVGTextElement>>(new Map());
    const edgeByKeyRef = useRef<Map<string, SVGLineElement>>(new Map());
    // Read by the tick handler to compute label outward-direction per node.
    // Updated in place by the structure-update effect so the once-bound tick
    // closure always sees the latest adjacency.
    const neighborsRef = useRef<Map<string, Set<string>> | null>(null);
    // First-pass anneal flag. The initial seed packs all linked nodes inside
    // a 140-radius circle; alpha(0.3) cools too fast (~110 ticks) to spread
    // hub-connected leaves out of that pack. We warm to alpha(1) the first
    // time, then drop back to alpha(0.3) for incremental structure updates.
    const hasInitializedRef = useRef(false);

    const nodeDragCleanupRef = useRef<(() => void) | null>(null);
    // Pan/zoom transform held in a ref (not state) and applied directly via
    // setAttribute. Using state would re-render the entire SVG tree on every
    // wheel tick — that's the visible flicker.
    const transformRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 });
    // Node-drag state. Tracked in a ref so the pointermove handler doesn't
    // re-bind every render, and so the click suppression flag can be inspected
    // synchronously from the circle's onClick.
    const nodeDragRef = useRef<{
        id: string;
        node: GNode;
        pointerId: number;
        startX: number;
        startY: number;
        moved: boolean;
    } | null>(null);
    const suppressNextClickRef = useRef(false);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [hideIsolated, setHideIsolated] = useState(false);

    const applyTransform = () => {
        const { x, y, k } = transformRef.current;
        innerGRef.current?.setAttribute('transform', `translate(${x} ${y}) scale(${k})`);
    };

    const { nodes, links, neighbors } = useMemo(() => {
        // Fast-path: if all four inputs are reference-equal to the previous
        // run, skip the full O(N+E) derivation entirely. The indexer often
        // re-emits an unchanged linkIndex with a bumped linksVersion; this
        // guard makes that case free.
        const prev = memoInputsRef.current;
        if (
            prev && lastDerivedRef.current &&
            prev.notes === notes &&
            prev.linkIndex === linkIndex &&
            prev.linksVersion === linksVersion &&
            prev.hideIsolated === hideIsolated
        ) {
            return lastDerivedRef.current;
        }

        const resolver = buildLinkResolver(notes);
        const degree = new Map<string, number>();
        const linkList: GLink[] = [];
        const nb = new Map<string, Set<string>>();
        if (linkIndex) {
            for (const edge of linkIndex.getAllEdges()) {
                // Resolve normalized target to a real note id. Dangling edges are
                // skipped (graph is cleaner and d3-force can't layout nowhere-nodes).
                const resolved = resolveLink(resolver, edge.target);
                if (!resolved) continue;
                if (resolved.id === edge.sourceId) continue;
                linkList.push({ source: edge.sourceId, target: resolved.id, isTransclusion: edge.isTransclusion });
                degree.set(edge.sourceId, (degree.get(edge.sourceId) ?? 0) + 1);
                degree.set(resolved.id, (degree.get(resolved.id) ?? 0) + 1);
                if (!nb.has(edge.sourceId)) nb.set(edge.sourceId, new Set());
                if (!nb.has(resolved.id)) nb.set(resolved.id, new Set());
                nb.get(edge.sourceId)!.add(resolved.id);
                nb.get(resolved.id)!.add(edge.sourceId);
            }
        }
        const visibleNotes = notes.filter(n => !hideIsolated || (degree.get(n.id) ?? 0) > 0);
        const isolatedTotal = visibleNotes.reduce(
            (count, n) => count + ((degree.get(n.id) ?? 0) === 0 ? 1 : 0),
            0,
        );
        const store = nodeStoreRef.current;
        const seenIds = new Set<string>();
        let linkedIndex = 0;
        let isolatedIndex = 0;
        const nodeList: GNode[] = visibleNotes.map(n => {
            const nodeDegree = degree.get(n.id) ?? 0;
            seenIds.add(n.id);
            const existing = store.get(n.id);
            if (existing) {
                existing.title = n.title || n.id;
                existing.degree = nodeDegree;
                if (nodeDegree > 0) linkedIndex++; else isolatedIndex++;
                return existing;
            }
            const seed = nodeDegree > 0
                ? linkedSeed(linkedIndex++)
                : isolatedSeed(isolatedIndex++, isolatedTotal);
            const fresh: GNode = {
                id: n.id,
                title: n.title || n.id,
                degree: nodeDegree,
                x: seed.x,
                y: seed.y,
            };
            store.set(n.id, fresh);
            return fresh;
        });

        // Short-circuit: if structure is unchanged, return the previous derived
        // object so downstream effect deps stay reference-equal. d3 mutates
        // link.source/target from string id → GNode reference, so compare
        // endpoints by id.
        const last = lastDerivedRef.current;
        if (last && last.nodes.length === nodeList.length && last.links.length === linkList.length) {
            let same = true;
            for (let i = 0; i < nodeList.length; i++) {
                if (last.nodes[i] !== nodeList[i]) { same = false; break; }
            }
            if (same) {
                for (let i = 0; i < linkList.length; i++) {
                    const la = last.links[i];
                    const lb = linkList[i];
                    const aSrc = typeof la.source === 'string' ? la.source : la.source.id;
                    const bSrc = typeof lb.source === 'string' ? lb.source : lb.source.id;
                    const aTgt = typeof la.target === 'string' ? la.target : la.target.id;
                    const bTgt = typeof lb.target === 'string' ? lb.target : lb.target.id;
                    if (aSrc !== bSrc || aTgt !== bTgt || la.isTransclusion !== lb.isTransclusion) {
                        same = false;
                        break;
                    }
                }
            }
            if (same) {
                memoInputsRef.current = { notes, linkIndex, linksVersion, hideIsolated };
                return last;
            }
        }

        // GC the node store only after we know the structure actually changed
        // — that way the short-circuit above always sees the same GNode
        // references in `last.nodes` it was built with.
        for (const id of Array.from(store.keys())) {
            if (!seenIds.has(id)) store.delete(id);
        }
        const result = { nodes: nodeList, links: linkList, neighbors: nb };
        lastDerivedRef.current = result;
        memoInputsRef.current = { notes, linkIndex, linksVersion, hideIsolated };
        return result;
        // linksVersion triggers re-derivation even when the array reference to
        // `notes` hasn't changed (body indexing refines link targets in place).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [notes, linkIndex, linksVersion, hideIsolated]);

    const maxDegree = useMemo(() => nodes.reduce((m, n) => Math.max(m, n.degree), 0), [nodes]);

    // Mount-once: build the simulation, bind the tick handler. The tick
    // handler reads element/node/link maps from refs, so structure changes
    // are applied without recreating the simulation — the previous design
    // recreated forceSimulation on every edge add/remove, which warmed
    // alpha back to 1 and triggered ~2s of intense O(N log N) ticking per
    // change.
    useEffect(() => {
        const sim = forceSimulation<GNode>([])
            // Isolated nodes get weaker repulsion so they don't slowly fan out
            // when they have no link tethering them.
            .force('charge', forceManyBody<GNode>().strength(d => (d.degree === 0 ? -70 : -260)))
            // Per-node anchors toward the viewBox center: gentle enough not
            // to fight link forces but strong enough to bound the cluster.
            // Replaces the old forceCenter, which only translated the
            // centroid and let the cluster expand without bound.
            .force('x', forceX<GNode>(WIDTH / 2).strength(0.04))
            .force('y', forceY<GNode>(HEIGHT / 2).strength(0.04))
            // Padded collide so labels (rendered to the right of each node)
            // have horizontal breathing room, not just the circle radius.
            .force('collide', forceCollide<GNode>().radius(d => clampDegreeToRadius(d.degree, maxDegreeRef.current) + 14))
            .force(
                'link',
                forceLink<GNode, GLink>([]).id(d => d.id).distance(95).strength(0.5),
            )
            .alphaDecay(0.05);
        sim.stop(); // start cool — structure-update effect will warm it
        simRef.current = sim;

        const tick = () => {
            const linksArr = linksArrRef.current;
            const nodesArr = nodesArrRef.current;
            const edgeByKey = edgeByKeyRef.current;
            const nodeById = nodeByIdRef.current;
            const labelById = labelByIdRef.current;
            const neighbors = neighborsRef.current;
            const nodeStore = nodeStoreRef.current;
            const maxDeg = maxDegreeRef.current;
            for (let i = 0; i < linksArr.length; i++) {
                const l = linksArr[i];
                const src = l.source as GNode;
                const tgt = l.target as GNode;
                const line = edgeByKey.get(`${src.id}→${tgt.id}`);
                if (!line) continue;
                line.setAttribute('x1', String(src.x ?? 0));
                line.setAttribute('y1', String(src.y ?? 0));
                line.setAttribute('x2', String(tgt.x ?? 0));
                line.setAttribute('y2', String(tgt.y ?? 0));
            }
            for (let i = 0; i < nodesArr.length; i++) {
                const n = nodesArr[i];
                const x = n.x ?? 0;
                const y = n.y ?? 0;
                const circle = nodeById.get(n.id);
                if (circle) {
                    circle.setAttribute('cx', String(x));
                    circle.setAttribute('cy', String(y));
                }
                const label = labelById.get(n.id);
                if (!label) continue;
                // Smart label placement: point each label outward, away from
                // the centroid of its connected neighbors. Hub-attached
                // leaves radiate outward instead of stacking to the right
                // of the hub.
                let dx = 0;
                let dy = 0;
                const nbrs = neighbors?.get(n.id);
                if (nbrs && nbrs.size > 0) {
                    let sumX = 0;
                    let sumY = 0;
                    let count = 0;
                    nbrs.forEach(nbId => {
                        const nb = nodeStore.get(nbId);
                        if (!nb) return;
                        sumX += nb.x ?? 0;
                        sumY += nb.y ?? 0;
                        count++;
                    });
                    if (count > 0) {
                        dx = x - sumX / count;
                        dy = y - sumY / count;
                    }
                } else {
                    // Isolated nodes: point outward from the viewBox center.
                    dx = x - WIDTH / 2;
                    dy = y - HEIGHT / 2;
                }
                const len = Math.hypot(dx, dy);
                if (len < 0.001) {
                    dx = 1;
                    dy = 0;
                } else {
                    dx /= len;
                    dy /= len;
                }
                const r = clampDegreeToRadius(n.degree, maxDeg);
                const pad = r + 6;
                label.setAttribute('x', String(x + dx * pad));
                label.setAttribute('y', String(y + dy * pad));
                // Discretize the anchor so labels read cleanly at any angle.
                // Cache the prior value to avoid spurious attribute writes.
                let anchor: 'start' | 'middle' | 'end' = 'middle';
                if (dx > 0.35) anchor = 'start';
                else if (dx < -0.35) anchor = 'end';
                if (label.getAttribute('text-anchor') !== anchor) {
                    label.setAttribute('text-anchor', anchor);
                }
            }
        };
        sim.on('tick', tick);
        return () => {
            sim.stop();
            sim.on('tick', null);
            simRef.current = null;
        };
    }, []);

    // The collide force reads maxDegree from a ref so we can update its
    // radius accessor without recreating the force. Keep this assignment
    // outside any effect so the ref is up-to-date by the time the next tick
    // (or the structure-update effect below) reads it.
    const maxDegreeRef = useRef(0);
    maxDegreeRef.current = maxDegree;

    // Apply structure updates in place. No forceSimulation() recreate, no
    // alpha=1 warm-up — just sim.nodes() / sim.force('link').links() and a
    // gentle alpha bump. d3-force re-initializes its internal state for
    // each force when its inputs change.
    useEffect(() => {
        const sim = simRef.current;
        if (!sim) return;
        const svg = svgRef.current;
        if (!svg) return;

        // Refresh DOM lookup caches against the freshly rendered tree.
        const edgeEls = svg.querySelectorAll<SVGLineElement>('.graph-edge');
        const nodeEls = svg.querySelectorAll<SVGCircleElement>('.graph-node');
        const labelEls = svg.querySelectorAll<SVGTextElement>('.graph-label');
        const edgeByKey = new Map<string, SVGLineElement>();
        edgeEls.forEach(el => {
            const k = el.dataset.edgeKey;
            if (k) edgeByKey.set(k, el);
        });
        const nodeById = new Map<string, SVGCircleElement>();
        nodeEls.forEach(el => {
            const id = el.dataset.nodeId;
            if (id) nodeById.set(id, el);
        });
        const labelById = new Map<string, SVGTextElement>();
        labelEls.forEach(el => {
            const id = el.dataset.nodeId;
            if (id) labelById.set(id, el);
        });
        edgeByKeyRef.current = edgeByKey;
        nodeByIdRef.current = nodeById;
        labelByIdRef.current = labelById;
        neighborsRef.current = neighbors;
        nodesArrRef.current = nodes;
        linksArrRef.current = links;

        if (!nodes.length) {
            sim.alpha(0).stop();
            return;
        }

        sim.nodes(nodes);
        const linkForce = sim.force('link') as ForceLink<GNode, GLink> | null;
        linkForce?.links(links);
        // Re-evaluate collide radius so the new maxDegree affects the
        // per-node radii without recreating the force.
        const collide = sim.force('collide') as ForceCollide<GNode> | null;
        collide?.radius(d => clampDegreeToRadius(d.degree, maxDegree) + 14);
        // First open: full alpha=1 warm so the tightly-seeded initial pack
        // can fully anneal. Subsequent updates only need a gentle 0.3 nudge
        // since positions are already near-equilibrium.
        const initialAlpha = hasInitializedRef.current ? 0.3 : 1;
        hasInitializedRef.current = true;
        sim.alpha(initialAlpha).restart();
    }, [nodes, links, maxDegree]);

    // Translate a clientX/clientY pair into the inner <g>'s coordinate space.
    // Accounts for the SVG viewBox scaling AND the user's pan/zoom transform.
    const clientToGraph = (clientX: number, clientY: number): { x: number; y: number } => {
        const svg = svgRef.current;
        const g = innerGRef.current;
        if (!svg || !g) return { x: 0, y: 0 };
        const pt = svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        const ctm = g.getScreenCTM();
        if (!ctm) return { x: 0, y: 0 };
        const graphPt = pt.matrixTransform(ctm.inverse());
        return { x: graphPt.x, y: graphPt.y };
    };

    const CLICK_DRAG_THRESHOLD = 4; // px in client-space

    const handleNodePointerDown = (e: React.PointerEvent<SVGCircleElement>, node: GNode) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        const sim = simRef.current;
        if (!sim) return;
        nodeDragCleanupRef.current?.();
        const { x, y } = clientToGraph(e.clientX, e.clientY);
        node.fx = x;
        node.fy = y;
        sim.alphaTarget(0.3).restart();
        nodeDragRef.current = {
            id: node.id,
            node,
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            moved: false,
        };
        suppressNextClickRef.current = false;
        try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { }

        const removeDragListeners = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            nodeDragCleanupRef.current = null;
        };
        const finishDrag = (event: PointerEvent | null) => {
            const drag = nodeDragRef.current;
            if (event && (!drag || drag.pointerId !== event.pointerId)) return;
            if (drag) {
                drag.node.fx = null;
                drag.node.fy = null;
                if (drag.moved) suppressNextClickRef.current = true;
            }
            simRef.current?.alphaTarget(0);
            nodeDragRef.current = null;
            removeDragListeners();
        };
        const onMove = (event: PointerEvent) => {
            const drag = nodeDragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            const dx = event.clientX - drag.startX;
            const dy = event.clientY - drag.startY;
            if (!drag.moved && dx * dx + dy * dy > CLICK_DRAG_THRESHOLD * CLICK_DRAG_THRESHOLD) {
                drag.moved = true;
            }
            const next = clientToGraph(event.clientX, event.clientY);
            drag.node.fx = next.x;
            drag.node.fy = next.y;
        };
        const onUp = (event: PointerEvent) => {
            finishDrag(event);
        };
        nodeDragCleanupRef.current = () => finishDrag(null);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    };

    // If the browser misses pointerup (tab switch, window blur, OS gesture),
    // force-cool the simulation so alphaTarget(0.3) can't keep it ticking.
    useEffect(() => {
        const releaseStuckDrag = () => {
            nodeDragCleanupRef.current?.();
            simRef.current?.alphaTarget(0);
        };
        const onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') releaseStuckDrag();
        };
        window.addEventListener('blur', releaseStuckDrag);
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            releaseStuckDrag();
            window.removeEventListener('blur', releaseStuckDrag);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, []);

    // Pan + zoom via pointer events. Mutates a ref and writes the transform
    // attribute directly so we don't re-render React on every wheel tick.
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        // Cache the SVG bounding rect — calling getBoundingClientRect() per
        // wheel tick forces synchronous layout (60-120 flushes/sec during
        // smooth scroll). Refresh on resize and on pointerenter, both cheap.
        let cachedRect = svg.getBoundingClientRect();
        const refreshRect = () => { cachedRect = svg.getBoundingClientRect(); };
        let panStart: { x: number; y: number; tx: number; ty: number; pointerId: number } | null = null;
        const onDown = (e: PointerEvent) => {
            if (e.button !== 0) return;
            if ((e.target as Element).closest?.('.graph-node')) return;
            panStart = {
                x: e.clientX,
                y: e.clientY,
                tx: transformRef.current.x,
                ty: transformRef.current.y,
                pointerId: e.pointerId,
            };
        };
        const onMove = (e: PointerEvent) => {
            if (!panStart || e.pointerId !== panStart.pointerId) return;
            transformRef.current = {
                ...transformRef.current,
                x: panStart.tx + (e.clientX - panStart.x),
                y: panStart.ty + (e.clientY - panStart.y),
            };
            applyTransform();
        };
        const onUp = (e: PointerEvent) => {
            if (panStart && e.pointerId === panStart.pointerId) panStart = null;
        };
        let zoomIdleTimer: ReturnType<typeof setTimeout> | null = null;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = -e.deltaY * 0.002;
            const rawX = ((e.clientX - cachedRect.left) / (cachedRect.width || WIDTH)) * WIDTH;
            const rawY = ((e.clientY - cachedRect.top) / (cachedRect.height || HEIGHT)) * HEIGHT;
            const cur = transformRef.current;
            const nextK = Math.min(3, Math.max(0.3, cur.k * (1 + delta)));
            const graphX = (rawX - cur.x) / cur.k;
            const graphY = (rawY - cur.y) / cur.k;
            transformRef.current = {
                x: rawX - graphX * nextK,
                y: rawY - graphY * nextK,
                k: nextK,
            };
            applyTransform();
            // Suppress hover crossings while zooming. Without this, circles
            // sliding under the cursor each wheel tick would set/clear
            // hoveredId and cause an N-circle React re-render storm.
            svg.classList.add('is-zooming');
            if (zoomIdleTimer) clearTimeout(zoomIdleTimer);
            zoomIdleTimer = setTimeout(() => svg.classList.remove('is-zooming'), 140);
        };
        svg.addEventListener('pointerdown', onDown);
        svg.addEventListener('pointerenter', refreshRect);
        window.addEventListener('resize', refreshRect);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        svg.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            svg.removeEventListener('pointerdown', onDown);
            svg.removeEventListener('pointerenter', refreshRect);
            window.removeEventListener('resize', refreshRect);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            svg.removeEventListener('wheel', onWheel);
            if (zoomIdleTimer) clearTimeout(zoomIdleTimer);
        };
        // applyTransform reads/writes refs only — no deps needed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const resetTransform = () => {
        transformRef.current = { x: 0, y: 0, k: 1 };
        applyTransform();
    };

    const hoveredNeighbors = hoveredId ? neighbors.get(hoveredId) ?? new Set<string>() : null;

    return (
        <div className="graph-overlay">
            <div className="graph-toolbar">
                <h2>
                    Graph <span className="text-muted font-normal">({nodes.length} notes, {links.length} links)</span>
                </h2>
                <div className="flex items-center gap-3 text-xs">
                    <label className="flex items-center gap-1.5 text-muted cursor-pointer">
                        <input type="checkbox" checked={hideIsolated} onChange={e => setHideIsolated(e.target.checked)} />
                        Hide unlinked
                    </label>
                    <button
                        onClick={resetTransform}
                        className="px-2 py-1 border border-[var(--border)] rounded text-muted hover:text-text hover:bg-[var(--panel-2)] transition-colors"
                    >
                        Reset view
                    </button>
                    <button
                        onClick={onClose}
                        className="px-2 py-1 border border-[var(--border)] rounded text-muted hover:text-text hover:bg-[var(--panel-2)] transition-colors"
                    >
                        Close (Esc)
                    </button>
                </div>
            </div>
            <div className="graph-canvas-wrap" onKeyDown={e => e.key === 'Escape' && onClose()} tabIndex={-1}>
                <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid meet">
                    {/* The transform on this <g> is owned imperatively by
                        applyTransform(). Keep this JSX literal stable so
                        React no-ops the attribute write on every re-render —
                        any dynamic expression here would silently clobber
                        pan/zoom. */}
                    <g ref={innerGRef} transform="translate(0 0) scale(1)">
                        {links.map((l, idx) => (
                            <line
                                key={`e${idx}`}
                                data-edge-key={edgeKey(l.source, l.target)}
                                className={`graph-edge${l.isTransclusion ? ' transclude' : ''}`}
                            />
                        ))}
                        {nodes.map(n => {
                            const r = clampDegreeToRadius(n.degree, maxDegree);
                            const isActive = n.id === activeId;
                            const isHover = n.id === hoveredId;
                            const faded = !!(hoveredId && !isHover && !(hoveredNeighbors && hoveredNeighbors.has(n.id)));
                            const classes = ['graph-node'];
                            if (isActive) classes.push('active');
                            if (n.degree === 0) classes.push('isolated');
                            return (
                                <circle
                                    key={n.id}
                                    data-node-id={n.id}
                                    className={classes.join(' ')}
                                    r={r}
                                    opacity={faded ? 0.25 : 1}
                                    style={{ cursor: 'grab' }}
                                    onMouseEnter={() => setHoveredId(n.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                    onPointerDown={e => handleNodePointerDown(e, n)}
                                    onClick={() => {
                                        if (suppressNextClickRef.current) {
                                            suppressNextClickRef.current = false;
                                            return;
                                        }
                                        onSelect(n.id);
                                    }}
                                >
                                    <title>{n.title} ({n.degree} links) — drag to rearrange</title>
                                </circle>
                            );
                        })}
                        {nodes.map(n => {
                            const faded = hoveredId && n.id !== hoveredId && !(hoveredNeighbors && hoveredNeighbors.has(n.id));
                            return (
                                <text
                                    key={`t${n.id}`}
                                    data-node-id={n.id}
                                    className="graph-label"
                                    dominantBaseline="middle"
                                    opacity={faded ? 0.2 : (n.degree === 0 ? 0.7 : 1)}
                                >
                                    {n.title.length > 32 ? `${n.title.slice(0, 30)}…` : n.title}
                                </text>
                            );
                        })}
                    </g>
                </svg>
                {!nodes.length && (
                    <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
                        No notes to graph.
                    </div>
                )}
            </div>
        </div>
    );
}

export default memo(GraphView);
