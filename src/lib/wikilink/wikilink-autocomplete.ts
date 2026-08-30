/**
 * Wikilink autocomplete — two inline triggers:
 *   - `[[` typed anywhere opens the picker and narrows as the user types
 *   - `@`  typed after whitespace / at line-start opens the same picker;
 *          selecting inserts `[[target]]` (the `@` is replaced)
 *
 * Selection replaces the trigger + any query text the user has typed with
 * a full `[[target]]` wikilink and leaves the caret after the `]]`.
 *
 * Keyboard: ↑ ↓ navigate the list, Enter confirms, Escape cancels. All
 * handled via ProseMirror's handleKeyDown hook so we don't fight Crepe's
 * own key map.
 *
 * The popup is a floating DOM element absolutely-positioned under the
 * current caret — mirrors the pattern used by the template hint widget in
 * MilkdownEditor.tsx.
 */

import { Plugin, PluginKey, type EditorState } from '@milkdown/kit/prose/state';
import { type EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';

export interface WikilinkAutocompleteTarget {
  /** Normalized display title — used for filtering and inserted into the doc. */
  title: string;
  /** Relative id / path — shown as a subtle secondary label. */
  id: string;
}

export interface WikilinkAutocompleteOptions {
  /**
   * Returns a filtered list of candidate targets for the given query. Query
   * starts empty when the trigger first fires, then updates on every
   * keystroke. Callers should fuzzy-match against their source-of-truth
   * (the notes array) and return at most ~20 entries.
   */
  getCandidates: (query: string) => WikilinkAutocompleteTarget[];
  /**
   * Invoked when the user picks a target. The plugin has already replaced
   * the trigger + query with `[[target]]`. Receivers can use this for
   * analytics or to bump the note's recency.
   */
  onPick?: (target: WikilinkAutocompleteTarget) => void;
}

interface TriggerState {
  /** Doc position where the trigger started (start of `[[` or `@`). */
  from: number;
  /** Doc position of the caret at trigger time. Updated each keystroke. */
  to: number;
  /** The kind of trigger — drives how the insertion replaces source text. */
  kind: 'bracket' | 'at';
  /** Current query string (what the user typed after the trigger). */
  query: string;
}

const key = new PluginKey<TriggerState | null>('NOTES_WIKILINK_AUTOCOMPLETE');

// Check the text immediately before `pos` in the parent text node for a
// live trigger. Returns the match with its start offset in doc coords.
function detectTrigger(state: EditorState): TriggerState | null {
  const { $from } = state.selection;
  if (!state.selection.empty) return null;
  if ($from.parent.type.spec.code) return null;
  const parentStart = $from.start();
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, ' ');
  // Bracket trigger: nearest `[[` in the parent block, no newlines between
  // it and the caret, no `]]` that closes it.
  const bracketIdx = textBefore.lastIndexOf('[[');
  if (bracketIdx !== -1) {
    const after = textBefore.slice(bracketIdx + 2);
    if (!after.includes(']]') && !after.includes('\n')) {
      return {
        from: parentStart + bracketIdx,
        to: $from.pos,
        kind: 'bracket',
        query: after,
      };
    }
  }
  // `@` trigger: must be preceded by whitespace or line-start, followed by
  // a query containing only word characters / spaces (no `@` chain).
  const atMatch = /(^|[\s(\[])@([\w\s]{0,60})$/.exec(textBefore);
  if (atMatch) {
    const relativeStart = textBefore.length - atMatch[0].length + (atMatch[1].length);
    return {
      from: parentStart + relativeStart,
      to: $from.pos,
      kind: 'at',
      query: atMatch[2],
    };
  }
  return null;
}

class AutocompleteWidget {
  readonly dom: HTMLElement;
  private list: WikilinkAutocompleteTarget[] = [];
  private selectedIdx = 0;
  private onPickCb: (target: WikilinkAutocompleteTarget) => void;
  private allowCreate = false;
  private currentQuery = '';
  // Cached references to the rendered rows so selection changes only toggle
  // a class + swap the `↵` hint, never rebuild the whole list. Rebuilding on
  // every selection change also caused a `mouseenter` feedback loop: a
  // stationary pointer over a freshly-inserted row retriggers mouseenter,
  // which sets selectedIdx, which rebuilds, which re-fires mouseenter…
  private rowEls: HTMLElement[] = [];

  constructor(onPick: (target: WikilinkAutocompleteTarget) => void) {
    this.onPickCb = onPick;
    this.dom = document.createElement('div');
    this.dom.className = 'wikilink-autocomplete';
    this.dom.setAttribute('role', 'listbox');
    // Swallow mousedown so clicking an item doesn't steal focus away from
    // ProseMirror — we'll still get a click to drive the pick.
    this.dom.addEventListener('mousedown', e => e.preventDefault());
  }

  setOnPick(onPick: (target: WikilinkAutocompleteTarget) => void): void {
    this.onPickCb = onPick;
  }

  setList(list: WikilinkAutocompleteTarget[], query: string): void {
    this.list = list;
    this.currentQuery = query;
    this.selectedIdx = 0;
    // Offer "create new" when no exact title matches and the query is non-empty.
    const trimmed = query.trim();
    this.allowCreate = trimmed.length >= 1 && !list.some(t => t.title.toLowerCase() === trimmed.toLowerCase());
    this.render();
    // No scrollIntoView here — a freshly-set list always has selectedIdx=0,
    // which is the top of the list. Calling scrollIntoView when the popup
    // hasn't been positioned yet can bubble a scroll up to ancestor scroll
    // containers (e.g. the editor pane) and yank the whole page.
  }

  move(delta: number): void {
    const total = this.rowEls.length;
    if (!total) return;
    this.setSelected((this.selectedIdx + delta + total) % total);
    this.scrollSelectedIntoView();
  }

  /** Shift the selection cursor to `idx`. No-op when already there; avoids
   *  the render loop that would otherwise trigger on hover → rebuild →
   *  re-mouseenter. Cheap: toggles a class + swaps the hint element. */
  setSelected(idx: number): void {
    if (idx === this.selectedIdx) return;
    if (idx < 0 || idx >= this.rowEls.length) return;
    this.selectedIdx = idx;
    this.applySelectedClass();
  }

  private applySelectedClass(): void {
    for (let i = 0; i < this.rowEls.length; i++) {
      const el = this.rowEls[i];
      const isSel = i === this.selectedIdx;
      el.classList.toggle('selected', isSel);
      // Swap the per-row `↵` hint: only the selected row shows it.
      const existingHint = el.querySelector('.wikilink-ac-rowhint');
      if (isSel && !existingHint) {
        const hint = document.createElement('span');
        hint.className = 'wikilink-ac-rowhint';
        hint.innerHTML = '<kbd>↵</kbd>';
        el.appendChild(hint);
      } else if (!isSel && existingHint) {
        existingHint.remove();
      }
    }
  }

  private scrollSelectedIntoView(): void {
    const sel = this.rowEls[this.selectedIdx];
    // block:'nearest' only scrolls the nearest scrollable ancestor — inside
    // the popup root (overflow:hidden) that's the .wikilink-ac-list, so this
    // can't reach the page's scroll pane even if popup positioning is stale.
    sel?.scrollIntoView({ block: 'nearest' });
  }

  pickCurrent(): WikilinkAutocompleteTarget | null {
    if (this.selectedIdx < this.list.length) return this.list[this.selectedIdx];
    if (this.allowCreate) {
      const title = this.currentQuery.trim();
      if (title) return { title, id: '' };
    }
    return null;
  }

  private render(): void {
    this.dom.replaceChildren();
    this.rowEls = [];
    const frag = document.createDocumentFragment();

    const list = document.createElement('div');
    list.className = 'wikilink-ac-list';

    const emptyList = !this.list.length;

    this.list.forEach((t, idx) => {
      const row = this.buildRow({
        icon: iconSvg('doc'),
        title: t.title,
        subtitle: t.id && t.id !== t.title ? t.id : '',
        selected: idx === this.selectedIdx,
      });
      row.addEventListener('click', () => { this.onPickCb(t); });
      // Hover moves the selection cursor instead of firing a separate style.
      // Single source of truth for "which row is focused" → no double-
      // highlight when keyboard and mouse point at different rows.
      row.addEventListener('mouseenter', () => this.setSelected(idx));
      list.appendChild(row);
      this.rowEls.push(row);
    });

    if (this.allowCreate) {
      const createIdx = this.list.length;
      const trimmed = this.currentQuery.trim();
      const row = this.buildRow({
        icon: iconSvg('plus'),
        title: `Create "${trimmed}"`,
        subtitle: 'New note',
        selected: createIdx === this.selectedIdx,
        variant: 'create',
      });
      row.addEventListener('click', () => {
        this.onPickCb({ title: trimmed, id: '' });
      });
      row.addEventListener('mouseenter', () => this.setSelected(createIdx));
      if (this.list.length) {
        const divider = document.createElement('div');
        divider.className = 'wikilink-ac-divider';
        list.appendChild(divider);
      }
      list.appendChild(row);
      this.rowEls.push(row);
    }

    if (emptyList && !this.allowCreate) {
      const empty = document.createElement('div');
      empty.className = 'wikilink-ac-empty';
      empty.textContent = 'No matching notes';
      list.appendChild(empty);
    }

    frag.appendChild(list);

    const footer = document.createElement('div');
    footer.className = 'wikilink-ac-footer';
    footer.innerHTML = [
      '<span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>',
      '<span><kbd>↵</kbd> select</span>',
      '<span><kbd>esc</kbd> close</span>',
    ].join('');
    frag.appendChild(footer);

    this.dom.appendChild(frag);
  }

  private buildRow(opts: {
    icon: string;
    title: string;
    subtitle: string;
    selected: boolean;
    variant?: 'create';
  }): HTMLElement {
    const row = document.createElement('div');
    row.className = 'wikilink-autocomplete-item'
      + (opts.selected ? ' selected' : '')
      + (opts.variant === 'create' ? ' create-new' : '');
    row.setAttribute('role', 'option');

    const icon = document.createElement('span');
    icon.className = 'wikilink-ac-icon';
    icon.innerHTML = opts.icon;
    row.appendChild(icon);

    const content = document.createElement('span');
    content.className = 'wikilink-ac-content';
    const title = document.createElement('span');
    title.className = 'wikilink-ac-title';
    title.textContent = opts.title;
    content.appendChild(title);
    if (opts.subtitle) {
      const sub = document.createElement('span');
      sub.className = 'wikilink-ac-path';
      sub.textContent = opts.subtitle;
      content.appendChild(sub);
    }
    row.appendChild(content);

    if (opts.selected) {
      const hint = document.createElement('span');
      hint.className = 'wikilink-ac-rowhint';
      hint.innerHTML = `<kbd>↵</kbd>`;
      row.appendChild(hint);
    }
    return row;
  }
}

// Inline SVG icons — keeps the popup self-contained without an icon dep.
function iconSvg(kind: 'doc' | 'plus'): string {
  if (kind === 'plus') {
    return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v10M3 8h10"/></svg>';
  }
  return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h6l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"/><path d="M10 2v3h3"/></svg>';
}

export function createWikilinkAutocompletePlugin(optsRef: { current: WikilinkAutocompleteOptions }): Plugin {
  let widget: AutocompleteWidget | null = null;
  let dismissedTrigger: Pick<TriggerState, 'from' | 'kind'> | null = null;
  // Reposition callback installed while the popup is open so ambient scrolling
  // (user scrolls the editor pane or window) keeps the popup anchored to the
  // caret. Detached in close().
  let scrollReposition: (() => void) | null = null;

  const isDismissedTrigger = (trigger: TriggerState | null) => (
    !!dismissedTrigger
    && !!trigger
    && dismissedTrigger.from === trigger.from
    && dismissedTrigger.kind === trigger.kind
  );

  const close = () => {
    if (widget?.dom.parentElement) widget.dom.parentElement.removeChild(widget.dom);
    widget = null;
    if (scrollReposition) {
      window.removeEventListener('scroll', scrollReposition, true);
      window.removeEventListener('resize', scrollReposition);
      scrollReposition = null;
    }
  };

  // Position the popup relative to the viewport using the caret coords from
  // ProseMirror. Uses `position: fixed` (set from CSS via .wikilink-autocomplete)
  // so the popup never interacts with the editor's scroll container — no
  // chance of yanking the page when the popup first appears.
  //
  // Flip logic: prefer below the caret; flip above when there's not enough
  // room below but there IS enough room above. The popup's measured height
  // (max 320px per CSS) drives the decision; we measure after setList() so
  // the true height is known.
  const GAP = 6;
  const MARGIN = 8;
  const position = (view: EditorView, from: number) => {
    if (!widget) return;
    const caret = view.coordsAtPos(from);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popup = widget.dom;
    // Reveal with visibility hidden for measurement if still zero-sized.
    const h = popup.offsetHeight || 280;
    const w = popup.offsetWidth || 300;

    const spaceBelow = vh - caret.bottom;
    const spaceAbove = caret.top;
    const showAbove = spaceBelow < h + GAP + MARGIN && spaceAbove > spaceBelow;

    let top: number;
    if (showAbove) {
      // Anchor the popup's bottom `GAP` above the caret's top.
      top = Math.max(MARGIN, caret.top - h - GAP);
    } else {
      // Below the caret, but don't let it run off the bottom of the viewport.
      top = Math.min(vh - h - MARGIN, caret.bottom + GAP);
    }
    // Clamp horizontally within the viewport.
    let left = caret.left;
    if (left + w + MARGIN > vw) left = vw - w - MARGIN;
    if (left < MARGIN) left = MARGIN;

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.dataset.flipped = showAbove ? '1' : '0';
  };

  const insertPick = (view: EditorView, trigger: TriggerState, target: WikilinkAutocompleteTarget) => {
    dismissedTrigger = null;
    const insertText = `[[${target.title}]]`;
    const tr = view.state.tr.replaceWith(
      trigger.from,
      trigger.to,
      view.state.schema.text(insertText),
    );
    view.dispatch(tr);
    close();
    optsRef.current.onPick?.(target);
  };

  return new Plugin<TriggerState | null>({
    key,
    view() {
      return {
        update: (view) => {
          const trigger = detectTrigger(view.state);
          if (!trigger) {
            dismissedTrigger = null;
            close();
            return;
          }
          if (dismissedTrigger && !isDismissedTrigger(trigger)) dismissedTrigger = null;
          if (isDismissedTrigger(trigger)) {
            close();
            return;
          }
          const candidates = optsRef.current.getCandidates(trigger.query).slice(0, 20);
          if (!widget) {
            widget = new AutocompleteWidget(target => insertPick(view, trigger, target));
            // Always mount to <body> with fixed positioning (driven by CSS).
            // Mounting into the editor's parent risked pulling the page's
            // scroll container around when the popup was briefly rendered at
            // its default in-flow position before `position()` ran.
            widget.dom.style.visibility = 'hidden';
            document.body.appendChild(widget.dom);
          }
          widget.setOnPick(target => insertPick(view, trigger, target));
          widget.setList(candidates, trigger.query);
          // Measure + place, then reveal. Using rAF so the browser has laid
          // out the freshly-set list before we read offsetHeight.
          const freshTrigger = trigger;
          requestAnimationFrame(() => {
            if (!widget) return;
            position(view, freshTrigger.from);
            widget.dom.style.visibility = 'visible';
          });
          // Install (once) the ambient scroll/resize reposition. Reads the
          // LATEST trigger position from plugin state so it doesn't stick to
          // a stale caret position from the first render.
          if (!scrollReposition) {
            scrollReposition = () => {
              if (!widget) return;
              const current = detectTrigger(view.state);
              if (!current) return;
              position(view, current.from);
            };
            window.addEventListener('scroll', scrollReposition, true);
            window.addEventListener('resize', scrollReposition);
          }
        },
        destroy: () => {
          close();
        },
      };
    },
    props: {
      handleKeyDown(view, event) {
        const trigger = detectTrigger(view.state);
        if (!trigger || !widget) return false;
        switch (event.key) {
          case 'ArrowDown':
            event.preventDefault();
            widget.move(1);
            return true;
          case 'ArrowUp':
            event.preventDefault();
            widget.move(-1);
            return true;
          case 'Enter':
          case 'Tab': {
            const picked = widget.pickCurrent();
            if (!picked) return false;
            event.preventDefault();
            insertPick(view, trigger, picked);
            return true;
          }
          case 'Escape':
            event.preventDefault();
            dismissedTrigger = { from: trigger.from, kind: trigger.kind };
            close();
            return true;
          default:
            return false;
        }
      },
    },
  });
}

export function createWikilinkAutocompleteEditorPlugin(optsRef: { current: WikilinkAutocompleteOptions }) {
  return $prose(() => createWikilinkAutocompletePlugin(optsRef));
}
