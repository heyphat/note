// JSON Canvas spec types — https://jsoncanvas.org/spec/1.0/
// Mirrors the Obsidian `.canvas` format so notes authored here can be
// exchanged with Obsidian (and any other JSON Canvas implementation).

export type CanvasColor = string; // "1".."6" preset, or "#rrggbb"

export type CanvasSide = 'top' | 'right' | 'bottom' | 'left';

export type CanvasEndType = 'none' | 'arrow';

interface CanvasNodeBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: CanvasColor;
  // Unknown / app-specific fields seen on the node when parsing. Preserved
  // verbatim through a parse → edit → serialize round-trip so canvases
  // authored in Obsidian (or against a newer JSON Canvas spec rev) don't
  // lose data the first time the user moves a node. Internal name —
  // serializers strip nothing else and writers don't set this directly.
  __extra?: Record<string, unknown>;
}

export interface CanvasTextNode extends CanvasNodeBase {
  type: 'text';
  text: string;
}

export interface CanvasFileNode extends CanvasNodeBase {
  type: 'file';
  file: string;
  subpath?: string;
}

export interface CanvasLinkNode extends CanvasNodeBase {
  type: 'link';
  url: string;
}

export interface CanvasGroupNode extends CanvasNodeBase {
  type: 'group';
  label?: string;
  background?: string;
  backgroundStyle?: 'cover' | 'ratio' | 'repeat';
}

export type CanvasNode =
  | CanvasTextNode
  | CanvasFileNode
  | CanvasLinkNode
  | CanvasGroupNode;

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: CanvasSide;
  fromEnd?: CanvasEndType;
  toNode: string;
  toSide?: CanvasSide;
  toEnd?: CanvasEndType;
  color?: CanvasColor;
  label?: string;
  /** See `CanvasNodeBase.__extra`. */
  __extra?: Record<string, unknown>;
}

export interface CanvasDoc {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  /** Top-level fields outside the JSON Canvas spec, preserved on round-trip. */
  __extra?: Record<string, unknown>;
}

export const EMPTY_CANVAS: CanvasDoc = { nodes: [], edges: [] };
