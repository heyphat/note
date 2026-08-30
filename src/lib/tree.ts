// Shared folder/note tree utilities. Both the sidebar NoteTree and the
// FileExplorerPalette use these to turn a flat vault listing into a nested
// structure and then back into a virtualizable row list.

import type { NoteMeta } from '@/lib/storage';

export const DELETE_CONFIRM_MS = 3000;

export interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  note?: NoteMeta;
}

export interface FlatRow {
  kind: 'note' | 'folder';
  /** Stable React key — path alone collides between pinned and tree sections. */
  key: string;
  depth: number;
  note?: NoteMeta;
  node?: TreeNode;
}

export function parentOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

export function isDescendantOrSelf(candidate: string, ancestor: string): boolean {
  if (!ancestor) return true; // everything is under root
  return candidate === ancestor || candidate.startsWith(`${ancestor}/`);
}

export function buildTree(notes: NoteMeta[], folders: string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', children: [] };

  // Returns (or creates) the folder node at the given path parts.
  function getOrCreateFolder(parts: string[]): TreeNode {
    let cur = root;
    let pathSoFar = '';
    for (const part of parts) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
      let child = cur.children.find(c => c.name === part && !c.note);
      if (!child) {
        child = { name: part, path: pathSoFar, children: [] };
        cur.children.push(child);
      }
      cur = child;
    }
    return cur;
  }

  // Register explicit folders first so empty ones are visible
  for (const folder of folders) {
    getOrCreateFolder(folder.split('/').filter(Boolean));
  }

  // Then add notes under their parent folder
  for (const note of notes) {
    const parts = note.id.split('/').filter(Boolean);
    const filename = parts.pop()!;
    const parent = parts.length > 0 ? getOrCreateFolder(parts) : root;
    parent.children.push({ name: filename, path: note.id, children: [], note });
  }

  // Sort: folders first (alpha), then notes (by createdAt desc).
  // createdAt is stable — sorting by updatedAt causes rows to jump on every
  // save which is disorienting.
  function sort(node: TreeNode) {
    node.children.sort((a, b) => {
      const aFolder = !a.note;
      const bFolder = !b.note;
      if (aFolder !== bFolder) return aFolder ? -1 : 1;
      if (aFolder) return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      return (b.note!.createdAt).localeCompare(a.note!.createdAt);
    });
    node.children.forEach(sort);
  }
  sort(root);

  return root.children;
}

/**
 * Depth-first flatten of the tree respecting the caller's `expanded` set.
 * Collapsed folders contribute their own row but skip their descendants,
 * which is what makes the virtualizer's total-height math match the DOM
 * height the user actually sees.
 */
export function flattenTree(nodes: TreeNode[], expanded: Set<string>, keyPrefix = ''): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (list: TreeNode[], depth: number) => {
    for (const n of list) {
      if (n.note) {
        out.push({ kind: 'note', key: `${keyPrefix}${n.path}`, depth, note: n.note });
      } else {
        out.push({ kind: 'folder', key: `${keyPrefix}${n.path}`, depth, node: n });
        if (expanded.has(n.path)) walk(n.children, depth + 1);
      }
    }
  };
  walk(nodes, 0);
  return out;
}

/** Resolves a folder path to the direct children (folders + notes) within that folder. */
export function childrenAt(tree: TreeNode[], folderPath: string): TreeNode[] {
  if (!folderPath) return tree;
  const parts = folderPath.split('/').filter(Boolean);
  let cur: TreeNode[] = tree;
  for (const part of parts) {
    const next = cur.find(c => c.name === part && !c.note);
    if (!next) return [];
    cur = next.children;
  }
  return cur;
}
