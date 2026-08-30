'use client';

// Instant-appearing tooltip. Intended as a child of a button that has
// `relative group` on its className — group-hover/group-focus-visible
// drive the opacity. Use this instead of the native `title` attribute so
// the label appears immediately and can include a keyboard shortcut.
export default function Tooltip({
  label,
  shortcut,
  side = 'bottom',
  align = 'center',
}: {
  label: string;
  shortcut?: string;
  side?: 'top' | 'bottom';
  // Horizontal anchor: 'center' centers on the button (default), 'end' pins the
  // tooltip's right edge to the button's right edge (use for right-cluster
  // buttons so the tooltip extends left instead of off-screen), 'start' pins
  // the left edges.
  align?: 'start' | 'center' | 'end';
}) {
  const pos = side === 'top'
    ? 'bottom-full mb-1.5'
    : 'top-full mt-1.5';
  const anchor = align === 'end'
    ? 'right-0'
    : align === 'start'
      ? 'left-0'
      : 'left-1/2 -translate-x-1/2';
  // Rendered via `display: none` by default (not just `opacity: 0`) so an
  // `absolute`-positioned, `whitespace-nowrap` tooltip on a right-edge button
  // doesn't extend the document's scrollable area and create a spurious
  // horizontal scrollbar at the body level while the user isn't hovering.
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute ${pos} ${anchor}
        whitespace-nowrap rounded border border-[var(--border)] bg-[var(--panel-2)]
        px-2 py-1 text-[10px] leading-tight text-text shadow-md z-50
        hidden group-hover:block group-focus-visible:block`}
    >
      {label}
      {shortcut && <span className="ml-1.5 opacity-60">{shortcut}</span>}
    </span>
  );
}
