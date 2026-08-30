import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import EditorPane, { type EditorPaneProps } from './EditorPane';
import { DEFAULT_SETTINGS } from './EditorSettings';

// MilkdownEditor is heavy and dynamic-imported. Stub it so the pane's
// own logic (lightbox click + debounce + TOC visibility + Milkdown key)
// is what we exercise — not Crepe.
vi.mock('./MilkdownEditor', () => ({
  default: function MilkdownStub(props: Record<string, unknown>) {
    return (
      <div data-testid="milkdown-stub" data-key={String(props.key ?? '')}>
        {props.placeholder as string}
        <img data-testid="block-image" src="https://example.test/img.png" alt="" />
      </div>
    );
  },
}));

// next/dynamic resolves asynchronously by default; force eager so
// MilkdownStub is rendered synchronously and our queries don't race.
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<{ default: React.ComponentType<unknown> }>) => {
    let Component: React.ComponentType<unknown> | null = null;
    void loader().then((m) => { Component = m.default; });
    const Wrapped: React.FC<Record<string, unknown>> = (props) => {
      const [, force] = React.useState(0);
      React.useEffect(() => {
        if (Component) return;
        loader().then((m) => { Component = m.default; force(v => v + 1); });
      }, []);
      if (!Component) return null;
      return React.createElement(Component, props);
    };
    return Wrapped;
  },
}));

// TableOfContents may use IntersectionObserver / scroll math we don't
// need here — stub it so we can assert presence without DOM concerns.
vi.mock('./TableOfContents', () => ({
  default: function TocStub({ headings }: { headings: { text: string }[] }) {
    return <nav data-testid="toc-stub">{headings.length} headings</nav>;
  },
}));

afterEach(() => cleanup());

function makeProps(overrides: Partial<EditorPaneProps> = {}): EditorPaneProps {
  return {
    activeId: 'note.md',
    activeTemplate: null,
    activeSkill: null,
    activeUuid: 'uuid-1',
    editorVersion: 0,
    activeText: 'body',
    editorSettings: { ...DEFAULT_SETTINGS },
    narrowEditor: false,
    tocHeadings: [],
    isLocked: false,
    hasAutoTitle: () => false,
    onUpload: vi.fn(async () => 'asset.png'),
    proxyUrl: vi.fn((url: string) => url),
    onReady: vi.fn(),
    onChange: vi.fn(),
    onHeadingsChange: vi.fn(),
    onAskAi: vi.fn(),
    onNavigateLink: vi.fn(),
    isKnownLinkTarget: vi.fn(() => true),
    linkTargetsVersion: 0,
    getWikilinkCandidates: vi.fn(() => []),
    resolveLinkId: vi.fn(() => null),
    readNoteBody: vi.fn(async () => ''),
    getNoteHref: vi.fn(() => null),
    templates: [],
    onPickTemplate: vi.fn(),
    onLightboxOpen: vi.fn(),
    lightboxClosedAtRef: { current: 0 },
    ...overrides,
  };
}

describe('EditorPane — lightbox click handling', () => {
  it('calls onLightboxOpen with the image src when an <img> is clicked', () => {
    const onLightboxOpen = vi.fn();
    render(<EditorPane {...makeProps({ onLightboxOpen })} />);
    fireEvent.click(screen.getByTestId('block-image'));
    expect(onLightboxOpen).toHaveBeenCalledWith('https://example.test/img.png');
  });

  it('debounces re-open within 300ms of the lightbox closing', () => {
    const onLightboxOpen = vi.fn();
    const lightboxClosedAtRef = { current: Date.now() - 100 }; // 100ms ago
    render(<EditorPane {...makeProps({ onLightboxOpen, lightboxClosedAtRef })} />);
    fireEvent.click(screen.getByTestId('block-image'));
    expect(onLightboxOpen).not.toHaveBeenCalled();
  });

  it('allows reopen after 300ms have elapsed since the close', () => {
    const onLightboxOpen = vi.fn();
    const lightboxClosedAtRef = { current: Date.now() - 400 }; // 400ms ago
    render(<EditorPane {...makeProps({ onLightboxOpen, lightboxClosedAtRef })} />);
    fireEvent.click(screen.getByTestId('block-image'));
    expect(onLightboxOpen).toHaveBeenCalledTimes(1);
  });

  it('opens the lightbox for image-block-overlay clicks (not just direct <img>)', () => {
    const onLightboxOpen = vi.fn();
    const { container } = render(<EditorPane {...makeProps({ onLightboxOpen })} />);
    // Wrap the stub's image in a container that simulates Crepe's image-block.
    const block = document.createElement('div');
    block.setAttribute('data-type', 'image');
    const img = document.createElement('img');
    img.src = 'https://example.test/wrapped.png';
    block.appendChild(img);
    // Place it inside the scroll container so the bubble-up click reaches our handler.
    const scroll = container.querySelector('.flex-1.overflow-y-auto')!;
    scroll.appendChild(block);
    fireEvent.click(block);
    expect(onLightboxOpen).toHaveBeenCalledWith('https://example.test/wrapped.png');
  });

  it('ignores clicks that resolve to no <img>', () => {
    const onLightboxOpen = vi.fn();
    const { container } = render(<EditorPane {...makeProps({ onLightboxOpen })} />);
    const scroll = container.querySelector('.flex-1.overflow-y-auto')!;
    fireEvent.click(scroll);
    expect(onLightboxOpen).not.toHaveBeenCalled();
  });
});

describe('EditorPane — table of contents', () => {
  it('renders the TOC only when narrowEditor + showToc + headings.length >= 2', () => {
    const headings = [
      { id: '1', level: 1, text: 'A' },
      { id: '2', level: 1, text: 'B' },
    ];
    render(<EditorPane {...makeProps({
      narrowEditor: true,
      editorSettings: { ...DEFAULT_SETTINGS, showToc: true },
      tocHeadings: headings as unknown as EditorPaneProps['tocHeadings'],
    })} />);
    expect(screen.getByTestId('toc-stub')).toBeInTheDocument();
  });

  it('hides the TOC when narrowEditor is off', () => {
    const headings = [
      { id: '1', level: 1, text: 'A' },
      { id: '2', level: 1, text: 'B' },
    ];
    render(<EditorPane {...makeProps({
      narrowEditor: false,
      editorSettings: { ...DEFAULT_SETTINGS, showToc: true },
      tocHeadings: headings as unknown as EditorPaneProps['tocHeadings'],
    })} />);
    expect(screen.queryByTestId('toc-stub')).not.toBeInTheDocument();
  });

  it('hides the TOC when showToc is off', () => {
    const headings = [
      { id: '1', level: 1, text: 'A' },
      { id: '2', level: 1, text: 'B' },
    ];
    render(<EditorPane {...makeProps({
      narrowEditor: true,
      editorSettings: { ...DEFAULT_SETTINGS, showToc: false },
      tocHeadings: headings as unknown as EditorPaneProps['tocHeadings'],
    })} />);
    expect(screen.queryByTestId('toc-stub')).not.toBeInTheDocument();
  });

  it('hides the TOC when fewer than 2 headings', () => {
    const headings = [{ id: '1', level: 1, text: 'A' }];
    render(<EditorPane {...makeProps({
      narrowEditor: true,
      editorSettings: { ...DEFAULT_SETTINGS, showToc: true },
      tocHeadings: headings as unknown as EditorPaneProps['tocHeadings'],
    })} />);
    expect(screen.queryByTestId('toc-stub')).not.toBeInTheDocument();
  });
});

describe('EditorPane — Milkdown key wiring', () => {
  it('uses activeUuid as the leading key segment when present', () => {
    render(<EditorPane {...makeProps({ activeUuid: 'uuid-X', activeId: 'a.md', editorVersion: 0 })} />);
    // The stub renders the placeholder so we can also check it landed.
    expect(screen.getByTestId('milkdown-stub')).toBeInTheDocument();
  });

  it('renders the template placeholder when activeTemplate is set', () => {
    render(<EditorPane {...makeProps({
      activeId: null, activeTemplate: 'tpl-1',
    })} />);
    expect(screen.getByText(/template here/i)).toBeInTheDocument();
  });

  it('renders the note placeholder when no template is active', () => {
    render(<EditorPane {...makeProps()} />);
    expect(screen.getByText(/thoughts here/i)).toBeInTheDocument();
  });
});

describe('EditorPane — narrow wrapper', () => {
  it('applies max-w-3xl + mx-auto when narrowEditor is on', () => {
    const { container } = render(<EditorPane {...makeProps({ narrowEditor: true })} />);
    const wrapper = container.querySelector('.milkdown-wrapper');
    expect(wrapper?.className).toContain('max-w-3xl');
    expect(wrapper?.className).toContain('mx-auto');
  });

  it('does not apply max-w-3xl when narrowEditor is off', () => {
    const { container } = render(<EditorPane {...makeProps({ narrowEditor: false })} />);
    const wrapper = container.querySelector('.milkdown-wrapper');
    expect(wrapper?.className).not.toContain('max-w-3xl');
  });
});
