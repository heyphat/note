'use client';

import { useRef } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { settingsToCss, type Settings } from './EditorSettings';
import TableOfContents, { type TocHeading } from './TableOfContents';
import type { MilkdownEditorApi } from './MilkdownEditor';

// Mirror page.tsx's dynamic import of MilkdownEditor — keeps Crepe (the
// heavy editor bundle) out of the initial route bundle and SSR-disabled.
// The loader fallback uses the same `loadingEditor` i18n key so the
// "Loading editor..." copy stays consistent with the previous inline form.
const MilkdownEditor = dynamic(() => import('./MilkdownEditor'), {
  ssr: false,
  loading: function MilkdownLoading() {
    const t = useTranslations('page');
    return (
      <div className="milkdown-wrapper flex-1">
        <div style={{ padding: 32, color: 'var(--muted)', fontSize: 15 }}>{t('loadingEditor')}</div>
      </div>
    );
  },
});

export type EditorPaneProps = {
  // --- Identity / version ---
  /** Path-based id of the active note. Null when editing a template. */
  activeId: string | null;
  /** Template id when editing a template; otherwise null. */
  activeTemplate: string | null;
  /** Skill id when editing a skill; otherwise null. */
  activeSkill: string | null;
  /** Stable frontmatter UUID of the active note. The editor's `key` is
   *  anchored on this so a path-based rename (legacy uuid.md → title.md)
   *  doesn't remount the editor mid-typing. */
  activeUuid: string | null;
  /** Bumped to force a remount (e.g. after history restore / vault swap). */
  editorVersion: number;
  // --- Body + UI state ---
  activeText: string;
  editorSettings: Settings;
  narrowEditor: boolean;
  tocHeadings: TocHeading[];
  isLocked: boolean;
  /** Lookup so the editor can decide whether to autofocus on first mount. */
  hasAutoTitle: (id: string) => boolean;
  // --- Editor I/O callbacks ---
  onUpload: (file: File) => Promise<string>;
  proxyUrl: (url: string) => string;
  onReady: (getMarkdown: () => string, api: MilkdownEditorApi) => void;
  onChange: (markdown: string) => void;
  onHeadingsChange: (headings: TocHeading[]) => void;
  onAskAi?: (selection: string) => void;
  onNavigateLink?: (target: string, opts: { section: string; isTransclusion: boolean; event: MouseEvent }) => void;
  isKnownLinkTarget: (target: string) => boolean;
  linkTargetsVersion: number;
  getWikilinkCandidates: (query: string) => { title: string; id: string }[];
  resolveLinkId: (target: string) => string | null;
  readNoteBody: (id: string) => Promise<string>;
  getNoteHref: (target: string) => string | null;
  // --- Template hint widget shown on empty notes ---
  templates: { id: string; name: string }[];
  onPickTemplate: (templateId: string) => void | Promise<void>;
  // --- Lightbox plumbing (Lightbox itself is rendered by the page) ---
  /** Called with the clicked image's `src` when an image is opened. */
  onLightboxOpen: (src: string) => void;
  /** Page-owned ref. Updated by Lightbox's `onClose` to the close timestamp.
   *  Used here to debounce the click that just closed the lightbox so
   *  releasing the mouse on the image doesn't immediately reopen it. */
  lightboxClosedAtRef: React.MutableRefObject<number>;
};

// Editor pane: scroll container + lightbox click handler + narrow wrapper +
// table-of-contents overlay + the Milkdown editor itself. Owns its own
// `scrollContainerRef` (internal) and reads (but doesn't write) the
// page-scoped `lightboxClosedAtRef`.
export default function EditorPane({
  activeId,
  activeTemplate,
  activeSkill,
  activeUuid,
  editorVersion,
  activeText,
  editorSettings,
  narrowEditor,
  tocHeadings,
  isLocked,
  hasAutoTitle,
  onUpload,
  proxyUrl,
  onReady,
  onChange,
  onHeadingsChange,
  onAskAi,
  onNavigateLink,
  isKnownLinkTarget,
  linkTargetsVersion,
  getWikilinkCandidates,
  resolveLinkId,
  readNoteBody,
  getNoteHref,
  templates,
  onPickTemplate,
  onLightboxOpen,
  lightboxClosedAtRef,
}: EditorPaneProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      className="flex-1 overflow-y-auto"
      ref={scrollContainerRef}
      onClick={(e) => {
        // Skip if the lightbox just closed (prevents reopening on the same click).
        if (lightboxClosedAtRef.current && Date.now() - lightboxClosedAtRef.current < 300) return;
        const target = e.target as HTMLElement;
        // Direct click on an <img>.
        if (target.tagName === 'IMG' && (target as HTMLImageElement).src) {
          onLightboxOpen((target as HTMLImageElement).src);
          return;
        }
        // Click on Milkdown's image-block overlay — walk up to find the
        // image-block container, then grab the <img> inside it.
        const imgBlock = target.closest('[data-type="image"], .image-block, .milkdown-image-block');
        if (imgBlock) {
          const img = imgBlock.querySelector('img');
          if (img?.src) onLightboxOpen(img.src);
        }
      }}
    >
      <div className="relative">
        {narrowEditor && editorSettings.showToc && tocHeadings.length >= 2 && (
          <TableOfContents headings={tocHeadings} scrollContainer={scrollContainerRef.current} />
        )}
        <div
          className={`milkdown-wrapper h-full ${narrowEditor ? 'max-w-3xl mx-auto' : ''}`}
          style={settingsToCss(editorSettings) as React.CSSProperties}
          spellCheck={editorSettings.spellCheck}
        >
          <MilkdownEditor
            // Key on the stable frontmatter UUID, not the path-based
            // activeId — autosave can rename the file (legacy uuid.md →
            // title.md) which changes activeId, and a key flip in the
            // middle of typing would remount the editor and reset the
            // caret to the start of the line.
            key={`${activeUuid || activeId || activeTemplate || activeSkill}:${editorVersion}`}
            defaultValue={activeText}
            noteKey={(activeId || activeTemplate || activeSkill)!}
            onUpload={onUpload}
            proxyUrl={proxyUrl}
            placeholder={
              activeTemplate ? 'Write your template here ...'
              : activeSkill ? 'Write your skill instructions here ...'
              : 'Write your thoughts here ...'}
            onReady={onReady}
            onChange={onChange}
            onHeadingsChange={onHeadingsChange}
            focusMode={editorSettings.focusMode}
            typewriterMode={editorSettings.typewriterMode}
            locked={!activeTemplate && !activeSkill && isLocked}
            autoFocus={!!activeId && hasAutoTitle(activeId)}
            onAskAi={activeId ? onAskAi : undefined}
            onNavigateLink={activeId ? onNavigateLink : undefined}
            isKnownLinkTarget={isKnownLinkTarget}
            linkTargetsVersion={linkTargetsVersion}
            getWikilinkCandidates={getWikilinkCandidates}
            resolveLinkId={resolveLinkId}
            readNoteBody={readNoteBody}
            getNoteHref={getNoteHref}
            templateHint={activeId && !activeTemplate && !activeSkill
              ? {
                enabled: true,
                templates,
                onPick: onPickTemplate,
              }
              : null}
          />
        </div>
      </div>
    </div>
  );
}
