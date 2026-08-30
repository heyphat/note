// DOM-level editor enhancements that layer on top of Milkdown/Crepe without
// requiring new ProseMirror plugins. Each helper inspects/mutates the editor
// DOM based on the current ProseMirror output — safe because we only set
// data-* attributes (never re-arrange nodes) which ProseMirror ignores.

const FOCUS_OVERLAY_LAYER_NAMES = ['top', 'focus', 'bottom'] as const;
type FocusOverlayLayerName = typeof FOCUS_OVERLAY_LAYER_NAMES[number];
const VISUAL_BLOCK_SELECTOR_GROUPS = [
  '.milkdown-list-item-block, li',
  '.milkdown-image-block, [data-type="image"]',
  '.milkdown-code-block, pre',
  '.milkdown-table-block, table',
  'blockquote',
  'dl[data-type="footnote_definition"]',
  'p, h1, h2, h3, h4, h5, h6, hr',
] as const;

/**
 * Mark the top-level block containing the caret with data-focused="true",
 * and clear the attribute from every other top-level block.
 *
 * Resolution order:
 *   1. `findBlockFromPM()` — the caller-supplied hook that reads the
 *      authoritative ProseMirror selection. Bypasses every quirk of the
 *      browser Selection API and always yields a valid block if the editor
 *      has any content.
 *   2. The block containing the browser selection (if selection is in PM)
 *   3. The block that `document.activeElement` sits inside
 *   4. Fallback: the top-level block closest to the viewport center — so
 *      focus mode always has SOME visible anchor even when the user has
 *      just toggled the setting and hasn't clicked back into the editor.
 */
export function updateFocusedBlock(
  root: HTMLElement,
  findBlockFromPM?: () => HTMLElement | null,
): void {
  const pm = root.querySelector<HTMLElement>('.ProseMirror');
  if (!pm) return;

  const pmBlock = findBlockFromPM?.() ?? null;
  const block = toDirectChild(pm, pmBlock)
    ?? findBlockFromSelection(pm)
    ?? findBlockFromActiveElement(pm)
    ?? findBlockNearestViewportCenter(pm);
  if (!block) return;

  for (const child of Array.from(pm.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child === block) {
      if (child.dataset.focused !== 'true') child.dataset.focused = 'true';
    } else {
      if (child.dataset.focused) delete child.dataset.focused;
    }
  }
  if (!pm.classList.contains('has-focused')) pm.classList.add('has-focused');
}

function toDirectChild(pm: HTMLElement, node: HTMLElement | null): HTMLElement | null {
  let block: HTMLElement | null = node;
  while (block && block !== pm && block.parentElement !== pm) block = block.parentElement;
  if (!block || block === pm) return null;
  return block;
}

function findBlockFromSelection(pm: HTMLElement): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  let node: Node | null = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  if (!(node instanceof HTMLElement) || !pm.contains(node)) return null;
  return toDirectChild(pm, node);
}

function findBlockFromActiveElement(pm: HTMLElement): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !pm.contains(active)) return null;
  return toDirectChild(pm, active);
}

function findBlockNearestViewportCenter(pm: HTMLElement): HTMLElement | null {
  const children = Array.from(pm.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
  if (children.length === 0) return null;
  const viewportCenter = window.innerHeight / 2;
  let best: HTMLElement | null = null;
  let bestDist = Infinity;
  for (const child of children) {
    const rect = child.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const dist = Math.abs(mid - viewportCenter);
    if (dist < bestDist) {
      bestDist = dist;
      best = child;
    }
  }
  return best;
}

function findVisualBlockFromNode(pm: HTMLElement, node: Node | null): HTMLElement | null {
  const element: HTMLElement | null =
    node instanceof HTMLElement ? node : node instanceof Text ? node.parentElement : null;
  if (!element || !pm.contains(element)) return null;

  for (const selectors of VISUAL_BLOCK_SELECTOR_GROUPS) {
    const block = element.closest(selectors);
    if (block instanceof HTMLElement && pm.contains(block)) return block;
  }

  return toDirectChild(pm, element);
}

function findVisualBlockAtViewportY(pm: HTMLElement, clientY: number): HTMLElement | null {
  for (const selectors of VISUAL_BLOCK_SELECTOR_GROUPS) {
    const matches = Array.from(pm.querySelectorAll<HTMLElement>(selectors))
      .filter(block => {
        const rect = block.getBoundingClientRect();
        return rect.height > 0 && rect.top <= clientY && rect.bottom >= clientY;
      })
      .sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height);
    if (matches.length > 0) return matches[0];
  }

  const directChildren = Array.from(pm.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  const directChild = directChildren.find(block => {
    const rect = block.getBoundingClientRect();
    return rect.height > 0 && rect.top <= clientY && rect.bottom >= clientY;
  });
  return directChild ?? null;
}

/**
 * Resolve the currently focused visual block from the user's text selection.
 * Falls back to the top-level block nearest the viewport center when the
 * selection isn't inside the editor, so focus mode still has a visible anchor.
 */
export function findSelectionFocusBlock(root: HTMLElement): HTMLElement | null {
  const pm = root.querySelector<HTMLElement>('.ProseMirror');
  if (!pm) return null;
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const block = findVisualBlockFromNode(pm, sel.focusNode ?? range.startContainer);
    if (block) return block;
  }
  return findVisualBlockFromNode(pm, document.activeElement) ?? findBlockNearestViewportCenter(pm);
}

/**
 * Resolve the visual block under the mouse using the same DOM hierarchy that
 * Milkdown's block handle reacts to.
 */
export function findHoveredFocusBlock(root: HTMLElement, target: EventTarget | null, clientY?: number): HTMLElement | null {
  const pm = root.querySelector<HTMLElement>('.ProseMirror');
  if (!pm) return null;
  const hovered = findVisualBlockFromNode(pm, target instanceof Node ? target : null);
  if (hovered) return hovered;
  if (typeof clientY === 'number') return findVisualBlockAtViewportY(pm, clientY);
  return null;
}

/**
 * Shade the editor except for the target block. This follows Milkdown's block
 * hover/selection unit, so wrapped paragraphs stay highlighted as a single
 * visible band and list items can be focused individually.
 */
export function updateFocusOverlay(root: HTMLElement, target: HTMLElement | null): void {
  const pm = root.querySelector<HTMLElement>('.ProseMirror');
  if (!pm || !target || !pm.contains(target)) {
    clearFocusOverlay(root);
    return;
  }

  const rootRect = root.getBoundingClientRect();
  const pmRect = pm.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  if (pmRect.width === 0 || pmRect.height === 0) {
    clearFocusOverlay(root);
    return;
  }

  const pmTop = Math.max(0, pmRect.top - rootRect.top);
  const pmLeft = Math.max(0, pmRect.left - rootRect.left);
  const pmBottom = Math.max(pmTop, pmRect.bottom - rootRect.top);
  const targetTop = clamp(targetRect.top - rootRect.top, pmTop, pmBottom);
  const targetBottom = clamp(targetRect.bottom - rootRect.top, targetTop, pmBottom);
  const layers = ensureFocusOverlayLayers(root);

  positionFocusOverlayLayer(
    layers.top,
    pmLeft,
    pmTop,
    Math.max(0, pmRect.width),
    Math.max(0, targetTop - pmTop),
  );
  positionFocusOverlayLayer(
    layers.focus,
    pmLeft,
    targetTop,
    Math.max(0, pmRect.width),
    Math.max(2, targetBottom - targetTop),
  );
  positionFocusOverlayLayer(
    layers.bottom,
    pmLeft,
    targetBottom,
    Math.max(0, pmRect.width),
    Math.max(0, pmBottom - targetBottom),
  );
}

/** Remove the focus-mode overlay. Used when focus mode is turned off,
 * or when the editor unmounts. */
export function clearFocusOverlay(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-focus-overlay-layer]').forEach(el => el.remove());
}

/** Remove every data-focused marker. Used when the editor unmounts. */
export function clearFocusedBlock(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-focused]').forEach(el => delete el.dataset.focused);
  const pm = root.querySelector<HTMLElement>('.ProseMirror');
  if (!pm) return;
  pm.classList.remove('has-focused');
}

/**
 * Classic typewriter scroll: keep the caret line pinned to the vertical
 * center of the nearest scrollable ancestor. The document moves under a
 * stationary caret, so the writer's eye never has to chase it down the
 * page.
 *
 * We take the caret's viewport Y from the caller (derived from
 * ProseMirror's `view.coordsAtPos`) rather than from the DOM block bounds,
 * so the caret stays centered even while typing inside a long paragraph
 * that spans many visual lines.
 *
 * Small corrections still snap immediately so ordinary typing never feels
 * floaty. Larger jumps (for example pressing Enter into a new paragraph)
 * ease over a very short animation window, and repeated recenter requests
 * retarget that same animation instead of stacking abrupt scroll steps.
 * The ~8px deadband is wide enough to absorb sub-pixel layout jitter
 * (font metrics, line-height rounding) so typing within a visual line
 * doesn't produce micro-scrolls.
 */
const TYPEWRITER_DEADBAND_PX = 8;
const TYPEWRITER_SMOOTH_SCROLL_THRESHOLD_PX = 20;
const TYPEWRITER_SMOOTH_SCROLL_MAX_MS = 120;
type TypewriterScrollTarget = HTMLElement | Window;
type TypewriterScrollAnimation = {
  frame: number;
  startTop: number;
  targetTop: number;
  startedAt: number;
  durationMs: number;
};
const typewriterScrollAnimations = new WeakMap<TypewriterScrollTarget, TypewriterScrollAnimation>();
export function centerCaretLine(root: HTMLElement, caretClientY: number | null | undefined): void {
  if (caretClientY == null || !Number.isFinite(caretClientY)) return;
  const pm = root.querySelector<HTMLElement>('.ProseMirror');
  if (!pm) return;
  const container = findScrollableAncestor(pm);
  const viewportCenter = container
    ? container.getBoundingClientRect().top + container.clientHeight / 2
    : window.innerHeight / 2;
  const delta = caretClientY - viewportCenter;
  if (Math.abs(delta) < TYPEWRITER_DEADBAND_PX) return;
  const target = container ?? window;
  const currentTop = getTypewriterScrollTop(target);
  const maxTop = getTypewriterMaxScrollTop(target);
  const nextTop = clamp(currentTop + delta, 0, maxTop);
  const remaining = nextTop - currentTop;
  if (Math.abs(remaining) < TYPEWRITER_DEADBAND_PX) return;
  if (Math.abs(remaining) < TYPEWRITER_SMOOTH_SCROLL_THRESHOLD_PX) {
    cancelTypewriterScrollAnimation(target);
    setTypewriterScrollTop(target, nextTop);
    return;
  }
  animateTypewriterScroll(target, nextTop);
}

/**
 * Click handler for footnote references: scrolls the matching definition
 * into view and briefly highlights it. Install once on the editor root with
 * capture phase (ProseMirror swallows some clicks on atom nodes).
 */
export function handleFootnoteClick(root: HTMLElement, e: Event): void {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  const sup = target.closest<HTMLElement>('sup[data-type="footnote_reference"]');
  if (!sup) return;
  const label = sup.dataset.label;
  if (!label) return;
  const def = root.querySelector<HTMLElement>(`dl[data-type="footnote_definition"][data-label="${CSS.escape(label)}"]`);
  if (!def) return;
  def.scrollIntoView({ behavior: 'smooth', block: 'center' });
  def.classList.add('footnote-flash');
  setTimeout(() => def.classList.remove('footnote-flash'), 1400);
  e.preventDefault();
}

function ensureFocusOverlayLayers(root: HTMLElement): Record<FocusOverlayLayerName, HTMLDivElement> {
  const layers = {} as Record<FocusOverlayLayerName, HTMLDivElement>;
  for (const name of FOCUS_OVERLAY_LAYER_NAMES) {
    const existing = root.querySelector<HTMLDivElement>(`[data-focus-overlay-layer="${name}"]`);
    if (existing) {
      layers[name] = existing;
      continue;
    }
    const layer = document.createElement('div');
    layer.dataset.focusOverlayLayer = name;
    layer.setAttribute('aria-hidden', 'true');
    layer.className = 'focus-overlay-layer';
    root.appendChild(layer);
    layers[name] = layer;
  }
  return layers;
}

function positionFocusOverlayLayer(
  layer: HTMLDivElement,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  layer.style.left = `${Math.max(0, left)}px`;
  layer.style.top = `${Math.max(0, top)}px`;
  layer.style.width = `${Math.max(0, width)}px`;
  layer.style.height = `${Math.max(0, height)}px`;
}

function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement as HTMLElement | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getTypewriterScrollTop(target: TypewriterScrollTarget): number {
  if (target instanceof HTMLElement) return target.scrollTop;
  return window.scrollY ?? document.scrollingElement?.scrollTop ?? 0;
}

function setTypewriterScrollTop(target: TypewriterScrollTarget, top: number): void {
  if (target instanceof HTMLElement) {
    target.scrollTop = top;
    return;
  }
  window.scrollTo({ top, behavior: 'auto' });
}

function getTypewriterMaxScrollTop(target: TypewriterScrollTarget): number {
  if (target instanceof HTMLElement) return Math.max(0, target.scrollHeight - target.clientHeight);
  const scrollingEl = document.scrollingElement;
  if (!scrollingEl) return 0;
  return Math.max(0, scrollingEl.scrollHeight - window.innerHeight);
}

function cancelTypewriterScrollAnimation(target: TypewriterScrollTarget): void {
  const existing = typewriterScrollAnimations.get(target);
  if (!existing) return;
  window.cancelAnimationFrame(existing.frame);
  typewriterScrollAnimations.delete(target);
}

function animateTypewriterScroll(target: TypewriterScrollTarget, targetTop: number): void {
  cancelTypewriterScrollAnimation(target);
  const startTop = getTypewriterScrollTop(target);
  const distance = targetTop - startTop;
  if (Math.abs(distance) < TYPEWRITER_DEADBAND_PX) {
    setTypewriterScrollTop(target, targetTop);
    return;
  }
  const durationMs = Math.min(
    TYPEWRITER_SMOOTH_SCROLL_MAX_MS,
    70 + Math.abs(distance) * 1.2,
  );
  const animation: TypewriterScrollAnimation = {
    frame: 0,
    startTop,
    targetTop,
    startedAt: performance.now(),
    durationMs,
  };
  const tick = (now: number) => {
    const progress = clamp((now - animation.startedAt) / animation.durationMs, 0, 1);
    // Ease out quickly so the caret settles near center without a floaty tail.
    const eased = 1 - ((1 - progress) ** 3);
    setTypewriterScrollTop(
      target,
      animation.startTop + ((animation.targetTop - animation.startTop) * eased),
    );
    if (progress >= 1) {
      setTypewriterScrollTop(target, animation.targetTop);
      typewriterScrollAnimations.delete(target);
      return;
    }
    animation.frame = window.requestAnimationFrame(tick);
    typewriterScrollAnimations.set(target, animation);
  };
  animation.frame = window.requestAnimationFrame(tick);
  typewriterScrollAnimations.set(target, animation);
}

/**
 * Strip markdown syntax noise and count words. The goal is approximate
 * parity with the visual word count, not perfect markdown parsing — fenced
 * code blocks, link targets, and HTML tags are ignored so they don't inflate
 * the count.
 */
export function countStats(md: string): { words: number; chars: number; readingMinutes: number } {
  if (!md) return { words: 0, chars: 0, readingMinutes: 0 };
  const plain = md
    .replace(/```[\s\S]*?```/g, ' ')     // fenced code
    .replace(/`[^`]*`/g, ' ')             // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')// images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // link text only
    .replace(/<[^>]+>/g, ' ')             // html tags
    .replace(/^---[\s\S]*?\n---/m, ' ')   // leading frontmatter
    .replace(/[#*_~>]/g, ' ')             // md markers
    .replace(/\s+/g, ' ')
    .trim();
  const words = plain ? plain.split(' ').filter(Boolean).length : 0;
  const chars = md.length;
  const readingMinutes = words > 0 ? Math.max(1, Math.round(words / 220)) : 0;
  return { words, chars, readingMinutes };
}
