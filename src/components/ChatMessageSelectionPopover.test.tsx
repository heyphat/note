import React, { useRef } from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl as render } from '@/utils/test/intl';
import ChatMessageSelectionPopover from './ChatMessageSelectionPopover';

function makeRect(left: number, top: number, width: number): DOMRect {
  return {
    x: left,
    y: top,
    top,
    left,
    right: left + width,
    bottom: top + 16,
    width,
    height: 16,
    toJSON: () => ({}),
  } as DOMRect;
}

function Harness({ onAddToFollowUp }: { onAddToFollowUp: (selection: string) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <div ref={containerRef}>
        <div data-chat-message-role="assistant">
          <p>alpha beta gamma</p>
          <p>delta epsilon zeta</p>
        </div>
        <div data-chat-message-role="user">
          <p>my question text</p>
        </div>
      </div>
      <ChatMessageSelectionPopover
        containerRef={containerRef}
        onAddToFollowUp={onAddToFollowUp}
      />
    </>
  );
}

function selectRange(node: Node, start: number, end: number) {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

describe('ChatMessageSelectionPopover', () => {
  beforeEach(() => {
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: vi.fn(() => [makeRect(40, 80, 80)]),
    });
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: vi.fn(() => makeRect(40, 80, 80)),
    });
  });

  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    delete (Range.prototype as { getClientRects?: unknown }).getClientRects;
    delete (Range.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
  });

  it('shows the toolbar after a selection inside an assistant bubble', async () => {
    const onAddToFollowUp = vi.fn();
    render(<Harness onAddToFollowUp={onAddToFollowUp} />);

    const textNode = screen.getByText('alpha beta gamma').firstChild as Text;
    selectRange(textNode, 6, 10);

    fireEvent.mouseUp(document);

    const toolbar = await screen.findByRole('toolbar', { name: 'Selected text actions' });
    expect(toolbar).toBeInTheDocument();
  });

  it('passes the selected text through to onAddToFollowUp', async () => {
    const onAddToFollowUp = vi.fn();
    render(<Harness onAddToFollowUp={onAddToFollowUp} />);

    const textNode = screen.getByText('alpha beta gamma').firstChild as Text;
    selectRange(textNode, 6, 10);

    fireEvent.mouseUp(document);
    await screen.findByRole('toolbar', { name: 'Selected text actions' });

    fireEvent.click(screen.getByRole('button', { name: /Add to follow-up/i }));
    expect(onAddToFollowUp).toHaveBeenCalledWith('beta');
  });

  it('does not show the toolbar for selections inside user messages', async () => {
    render(<Harness onAddToFollowUp={vi.fn()} />);

    const textNode = screen.getByText('my question text').firstChild as Text;
    selectRange(textNode, 0, 5);

    fireEvent.mouseUp(document);

    await new Promise(resolve => requestAnimationFrame(resolve));
    expect(screen.queryByRole('toolbar', { name: 'Selected text actions' })).toBeNull();
  });

  it('preserves the native selection when the toolbar is clicked', async () => {
    const onAddToFollowUp = vi.fn();
    render(<Harness onAddToFollowUp={onAddToFollowUp} />);

    const textNode = screen.getByText('alpha beta gamma').firstChild as Text;
    selectRange(textNode, 0, 5);

    fireEvent.mouseUp(document);
    await screen.findByRole('toolbar', { name: 'Selected text actions' });

    const toolbar = screen.getByRole('toolbar', { name: 'Selected text actions' });
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    toolbar.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(window.getSelection()?.rangeCount).toBe(1);
  });

  it('hides the toolbar when the selection collapses', async () => {
    render(<Harness onAddToFollowUp={vi.fn()} />);

    const textNode = screen.getByText('alpha beta gamma').firstChild as Text;
    selectRange(textNode, 6, 10);

    fireEvent.mouseUp(document);
    await screen.findByRole('toolbar', { name: 'Selected text actions' });

    act(() => {
      window.getSelection()?.removeAllRanges();
      document.dispatchEvent(new Event('selectionchange'));
    });

    expect(screen.queryByRole('toolbar', { name: 'Selected text actions' })).toBeNull();
  });

  it('hides the toolbar on Escape', async () => {
    render(<Harness onAddToFollowUp={vi.fn()} />);

    const textNode = screen.getByText('alpha beta gamma').firstChild as Text;
    selectRange(textNode, 6, 10);

    fireEvent.mouseUp(document);
    await screen.findByRole('toolbar', { name: 'Selected text actions' });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('toolbar', { name: 'Selected text actions' })).toBeNull();
  });
});
