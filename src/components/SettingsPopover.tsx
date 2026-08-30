'use client';

// App-wide settings popover. Replaces the old sidebar-anchored panel with a
// centered modal (same family as CommandPalette / FileExplorerPalette) and a
// left-rail section navigator. Opens via the sidebar gear, the ⌘, shortcut,
// or the `ai:open-settings` event (dispatched by the ChatDrawer's "Add key"
// affordance, which auto-jumps to the AI section).

import React, { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import {
  type Pref, readStoredPref, applyTheme, prefLabel, type PrefLabels,
} from '@/components/ThemeToggle';
import ChatSelect from '@/components/ChatSelect';
import { showToast } from '@/components/Toast';
import type { IndexProgress } from '@/lib/search/types';
import {
  PROVIDERS, PROVIDER_IDS, getActiveSelection, setActiveSelection,
  getApiKey, setApiKey, getBedrockRegion, setBedrockRegion,
  clearAllApiKeys, BEDROCK_REGIONS, type ProviderId,
} from '@/lib/ai';
import { testConnection } from '@/lib/ai/stream';
import {
  listMcpServers, addMcpServer, updateMcpServer, deleteMcpServer,
  parseMcpServersJson,
  type McpServerConfig, type McpTransport,
} from '@/lib/ai/mcp-storage';
import { getMcpManager, type McpServerStatus } from '@/lib/ai/mcp';
import { usePathname, useRouter } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

export type SettingsSectionId = 'general' | 'ai' | 'mcp' | 'danger';

interface Props {
  open: boolean;
  onClose: () => void;
  // Sidebar visibility / density
  dense: boolean;
  onDenseChange: (next: boolean) => void;
  showCalendar: boolean;
  onShowCalendarChange: (next: boolean) => void;
  showTags: boolean;
  onShowTagsChange: (next: boolean) => void;
  showRecent: boolean;
  onShowRecentChange: (next: boolean) => void;
  showTemplates: boolean;
  onShowTemplatesChange: (next: boolean) => void;
  showSkills: boolean;
  onShowSkillsChange: (next: boolean) => void;
  // Index / reindex
  indexProgress: IndexProgress;
  onReindex: () => Promise<void> | void;
  // Pomodoro
  pomodoroFocusMinutes: number;
  pomodoroBreakMinutes: number;
  onPomodoroFocusChange: (next: number) => void;
  onPomodoroBreakChange: (next: number) => void;
  // Destructive
  onClearChats?: () => Promise<void> | void;
  onResetVault?: () => Promise<void> | void;
}

function emptyMap<T>(value: T): Record<ProviderId, T> {
  return Object.fromEntries(PROVIDER_IDS.map(pid => [pid, value])) as Record<ProviderId, T>;
}

export default function SettingsPopover(props: Props) {
  const { open, onClose } = props;
  const [section, setSection] = useState<SettingsSectionId>('general');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const t = useTranslations('settings');

  // Honor the legacy `ai:open-settings` event so the ChatDrawer's "Add key"
  // path still lands users on the AI section.
  useEffect(() => {
    const onOpenAi = () => {
      setSection('ai');
    };
    window.addEventListener('ai:open-settings', onOpenAi);
    return () => window.removeEventListener('ai:open-settings', onOpenAi);
  }, []);

  // Window-level Escape — capture phase so it wins over anything bubbling.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const sections: { id: SettingsSectionId; label: string }[] = [
    { id: 'general',  label: t('sectionGeneral') },
    { id: 'ai',       label: t('sectionAi') },
    { id: 'mcp',      label: t('sectionMcp') },
    { id: 'danger',   label: t('sectionDanger') },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 backdrop-blur-[2px] pt-[10vh] px-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={t('popoverAriaLabel')}
    >
      <div
        ref={panelRef}
        className="w-full max-w-3xl bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '85vh' }}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
          <div className="text-xs font-semibold text-text">{t('popoverTitle')}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            title={t('close')}
            className="w-6 h-6 inline-flex items-center justify-center rounded-md text-muted hover:text-text hover:bg-[var(--panel-2)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <nav className="w-44 shrink-0 border-r border-[var(--border)] py-2 overflow-y-auto">
            {sections.map(s => {
              const active = s.id === section;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSection(s.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`block w-full text-left px-3 py-1.5 text-[12px] transition-colors ${
                    active
                      ? 'bg-[var(--panel-2)] text-text font-medium border-l-2 border-accent'
                      : 'text-muted hover:text-text hover:bg-[var(--panel-2)] border-l-2 border-transparent'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </nav>
          <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4 space-y-6">
            {section === 'general' && (
              <>
                <GeneralSection />
                <SidebarVisibilitySection
                  dense={props.dense} onDenseChange={props.onDenseChange}
                  showCalendar={props.showCalendar} onShowCalendarChange={props.onShowCalendarChange}
                  showTags={props.showTags} onShowTagsChange={props.onShowTagsChange}
                  showRecent={props.showRecent} onShowRecentChange={props.onShowRecentChange}
                  showTemplates={props.showTemplates} onShowTemplatesChange={props.onShowTemplatesChange}
                  showSkills={props.showSkills} onShowSkillsChange={props.onShowSkillsChange}
                />
                <FocusSection
                  pomodoroFocusMinutes={props.pomodoroFocusMinutes}
                  pomodoroBreakMinutes={props.pomodoroBreakMinutes}
                  onPomodoroFocusChange={props.onPomodoroFocusChange}
                  onPomodoroBreakChange={props.onPomodoroBreakChange}
                />
                <IndexSection indexProgress={props.indexProgress} onReindex={props.onReindex} />
              </>
            )}
            {section === 'ai' && <AiSection />}
            {section === 'mcp' && <McpSection />}
            {section === 'danger' && (
              <DangerSection onClearChats={props.onClearChats} onResetVault={props.onResetVault} />
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// --- Section: General -------------------------------------------------------

function GeneralSection() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const tToast = useTranslations('toast');
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pref, setPref] = useState<Pref>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPref(readStoredPref());
    setMounted(true);
  }, []);

  useEffect(() => {
    const onExternal = () => setPref(readStoredPref());
    window.addEventListener('themechange', onExternal);
    return () => window.removeEventListener('themechange', onExternal);
  }, []);

  useEffect(() => {
    if (!mounted || pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mounted, pref]);

  const themeLabels: PrefLabels = {
    prefix: tToast('themePrefix'),
    light: t('themeLight'),
    dark: t('themeDark'),
    auto: tToast('themeAutoSuffix'),
  };

  const pickTheme = (next: Pref) => {
    setPref(next);
    applyTheme(next);
    showToast(prefLabel(next, themeLabels));
  };

  const themeOptions: { value: Pref; label: string }[] = [
    { value: 'system', label: t('themeAuto') },
    { value: 'light',  label: t('themeLight') },
    { value: 'dark',   label: t('themeDark') },
  ];

  const localeOptions: { value: Locale; label: string; short: string }[] = [
    { value: 'en', label: tCommon('english'),    short: 'EN' },
    { value: 'vi', label: tCommon('vietnamese'), short: 'VI' },
  ];

  const pickLocale = (next: Locale) => {
    if (next === locale) return;
    startTransition(() => { router.replace(pathname, { locale: next }); });
  };

  return (
    <SectionShell title={t('sectionGeneral')}>
      <Row label={t('sectionTheme')}>
        <Segmented
          value={mounted ? pref : 'system'}
          options={themeOptions}
          onChange={(v) => pickTheme(v as Pref)}
        />
      </Row>
      <Row label={t('sectionLanguage')}>
        <Segmented
          value={locale}
          options={localeOptions.map(o => ({ value: o.value, label: o.short }))}
          onChange={(v) => pickLocale(v as Locale)}
        />
      </Row>
    </SectionShell>
  );
}

// --- Section: Sidebar visibility -------------------------------------------

interface SidebarVisibilityProps {
  dense: boolean;
  onDenseChange: (next: boolean) => void;
  showCalendar: boolean;
  onShowCalendarChange: (next: boolean) => void;
  showTags: boolean;
  onShowTagsChange: (next: boolean) => void;
  showRecent: boolean;
  onShowRecentChange: (next: boolean) => void;
  showTemplates: boolean;
  onShowTemplatesChange: (next: boolean) => void;
  showSkills: boolean;
  onShowSkillsChange: (next: boolean) => void;
}

function SidebarVisibilitySection(p: SidebarVisibilityProps) {
  const t = useTranslations('settings');
  const tCalendar = useTranslations('calendar');
  const tTags = useTranslations('tagCloud');
  const tRecent = useTranslations('recent');
  const tTemplates = useTranslations('templates');

  const rows: { key: string; label: string; visible: boolean; onChange: (next: boolean) => void }[] = [
    { key: 'calendar',  label: tCalendar('heading'),  visible: p.showCalendar,  onChange: p.onShowCalendarChange },
    { key: 'tags',      label: tTags('heading'),      visible: p.showTags,      onChange: p.onShowTagsChange },
    { key: 'recent',    label: tRecent('heading'),    visible: p.showRecent,    onChange: p.onShowRecentChange },
    { key: 'templates', label: tTemplates('heading'), visible: p.showTemplates, onChange: p.onShowTemplatesChange },
    { key: 'skills',    label: 'Skills',              visible: p.showSkills,    onChange: p.onShowSkillsChange },
  ];

  return (
    <SectionShell title={t('sectionSidebar')}>
      <Row label={t('denseList')}>
        <Toggle on={p.dense} onToggle={() => p.onDenseChange(!p.dense)} />
      </Row>
      {rows.map(r => (
        <Row key={r.key} label={r.label}>
          <Toggle on={r.visible} onToggle={() => r.onChange(!r.visible)} />
        </Row>
      ))}
    </SectionShell>
  );
}

// --- Section: Focus (Pomodoro) ---------------------------------------------

interface FocusProps {
  pomodoroFocusMinutes: number;
  pomodoroBreakMinutes: number;
  onPomodoroFocusChange: (next: number) => void;
  onPomodoroBreakChange: (next: number) => void;
}

function FocusSection(p: FocusProps) {
  const t = useTranslations('settings');
  return (
    <SectionShell title={t('sectionFocus')}>
      <Row label={t('sessionLength')}>
        <select
          value={p.pomodoroFocusMinutes}
          onChange={e => p.onPomodoroFocusChange(Number(e.target.value))}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-text outline-none"
        >
          {[10, 15, 20, 25, 30, 45, 60, 90].map(m => (
            <option key={m} value={m}>{t('minutesShort', { n: m })}</option>
          ))}
        </select>
      </Row>
      <Row label={t('breakLength')}>
        <select
          value={p.pomodoroBreakMinutes}
          onChange={e => p.onPomodoroBreakChange(Number(e.target.value))}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-text outline-none"
        >
          {[3, 5, 10, 15, 20, 30].map(m => (
            <option key={m} value={m}>{t('minutesShort', { n: m })}</option>
          ))}
        </select>
      </Row>
    </SectionShell>
  );
}

// --- Section: Index --------------------------------------------------------

interface IndexProps {
  indexProgress: IndexProgress;
  onReindex: () => Promise<void> | void;
}

function IndexSection(p: IndexProps) {
  const t = useTranslations('settings');
  const [busy, setBusy] = useState(false);
  const { indexed, total } = p.indexProgress;
  const hasWork = total > 0;
  const inProgress = hasWork && indexed < total;
  const pct = hasWork ? Math.min(100, Math.floor((indexed / total) * 100)) : 0;
  const disabled = busy || inProgress || !hasWork;

  const handleReindex = async () => {
    if (disabled) return;
    setBusy(true);
    try { await Promise.resolve(p.onReindex()); }
    finally { setBusy(false); }
  };

  return (
    <SectionShell title={t('sectionIndex')}>
      <div className="space-y-2">
        <button
          type="button"
          onClick={handleReindex}
          aria-disabled={disabled || undefined}
          className={`w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md border text-xs transition-colors ${
            disabled
              ? 'border-[var(--border)] text-muted bg-[var(--panel-2)] cursor-default'
              : 'border-[var(--border)] text-text bg-[var(--panel-2)] hover:border-[var(--border-strong)] hover:bg-[var(--panel)]'
          }`}
        >
          <svg
            className={inProgress || busy ? 'reindex-spin' : ''}
            width="12" height="12" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M13 4a6 6 0 1 1-1.8-1.4" />
            <path d="M13 1v3h-3" />
          </svg>
          <span>
            {inProgress ? t('indexingPct', { pct })
              : !hasWork ? t('nothingToIndex')
              : t('reindexVault')}
          </span>
        </button>
        {inProgress ? (
          <div className="h-1 rounded-full bg-[var(--panel-2)] overflow-hidden">
            <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
        ) : (
          <div className="text-[10px] text-muted text-center">
            {hasWork ? t('notesIndexed', { count: total }) : t('vaultEmpty')}
          </div>
        )}
      </div>
    </SectionShell>
  );
}

// --- Section: AI -----------------------------------------------------------

function AiSection() {
  const t = useTranslations('settings');
  const tToast = useTranslations('toast');
  const [activeProvider, setActiveProviderState] = useState<ProviderId>('anthropic');
  const [activeModel, setActiveModelState] = useState<string>(PROVIDERS.anthropic.defaultModel);
  const [keys, setKeys] = useState<Record<ProviderId, string>>(() => emptyMap(''));
  const [showKey, setShowKey] = useState<Record<ProviderId, boolean>>(() => emptyMap(false));
  const [testingKey, setTestingKey] = useState<ProviderId | null>(null);
  const [testState, setTestState] = useState<Record<ProviderId, 'ok' | 'bad' | null>>(() => emptyMap(null as 'ok' | 'bad' | null));
  const [bedrockRegion, setBedrockRegionState] = useState<string>(BEDROCK_REGIONS[0].id);
  const testStateTimers = useRef<Partial<Record<ProviderId, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    const sel = getActiveSelection();
    setActiveProviderState(sel.providerId);
    setActiveModelState(sel.model);
    setKeys(Object.fromEntries(PROVIDER_IDS.map(pid => [pid, getApiKey(pid)])) as Record<ProviderId, string>);
    setBedrockRegionState(getBedrockRegion());
  }, []);

  useEffect(() => {
    const onActiveSelectionChange = () => {
      const sel = getActiveSelection();
      setActiveProviderState(sel.providerId);
      setActiveModelState(sel.model);
    };
    window.addEventListener('ai:active-changed', onActiveSelectionChange);
    return () => window.removeEventListener('ai:active-changed', onActiveSelectionChange);
  }, []);

  const pickProvider = (next: ProviderId) => {
    setActiveProviderState(next);
    const model = PROVIDERS[next].defaultModel;
    setActiveModelState(model);
    setActiveSelection({ providerId: next, model });
  };

  const pickModel = (modelId: string) => {
    setActiveModelState(modelId);
    setActiveSelection({ providerId: activeProvider, model: modelId });
  };

  const updateKey = (provider: ProviderId, value: string) => {
    setKeys(prev => ({ ...prev, [provider]: value }));
    setApiKey(provider, value);
  };

  const flashTestState = (provider: ProviderId, state: 'ok' | 'bad') => {
    setTestState(prev => ({ ...prev, [provider]: state }));
    if (testStateTimers.current[provider]) clearTimeout(testStateTimers.current[provider]);
    testStateTimers.current[provider] = setTimeout(() => {
      setTestState(prev => ({ ...prev, [provider]: null }));
    }, 2500);
  };

  const handleTestKey = async (provider: ProviderId) => {
    const key = keys[provider].trim();
    if (!key) { showToast(tToast('pasteKeyFirst')); return; }
    setTestingKey(provider);
    try {
      const probeModel = activeProvider === provider ? activeModel : PROVIDERS[provider].defaultModel;
      await testConnection(provider, key, probeModel);
      showToast(tToast('keyWorks'));
      flashTestState(provider, 'ok');
    } catch (err) {
      showToast(err instanceof Error ? err.message : tToast('keyTestFailed'));
      flashTestState(provider, 'bad');
    } finally {
      setTestingKey(null);
    }
  };

  return (
    <SectionShell title={t('sectionAi')}>
      <Row label={t('provider')}>
        <ChatSelect
          className="w-[200px]"
          buttonClassName="h-7 px-2 text-xs"
          ariaLabel={t('providerAria')}
          align="right"
          value={activeProvider}
          options={PROVIDER_IDS.map(pid => ({ id: pid, label: PROVIDERS[pid].label }))}
          onChange={id => pickProvider(id as ProviderId)}
        />
      </Row>
      <Row label={t('model')}>
        <ChatSelect
          className="w-[200px]"
          buttonClassName="h-7 px-2 text-xs"
          ariaLabel={t('modelAria')}
          align="right"
          value={activeModel}
          options={PROVIDERS[activeProvider].models.map(m => ({ id: m.id, label: m.label }))}
          onChange={pickModel}
        />
      </Row>

      <div className="mt-3 space-y-3">
        {PROVIDER_IDS.map(pid => {
          const provider = PROVIDERS[pid];
          const isJson = provider.keyKind === 'json';
          const indicatorClass = testState[pid] === 'ok' ? 'text-good'
            : testState[pid] === 'bad' ? 'text-bad'
            : 'text-muted hover:text-text';
          return (
            <div key={pid} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <label className="text-muted">{t('providerKeyLabel', { provider: provider.label })}</label>
                <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-[10px]">{t('getKey')}</a>
              </div>
              <div className={`flex ${isJson ? 'items-start' : 'items-center'} gap-1`}>
                {isJson ? (
                  <textarea
                    value={keys[pid]}
                    onChange={e => updateKey(pid, e.target.value)}
                    placeholder={provider.keyLabel}
                    rows={4}
                    spellCheck={false}
                    wrap="off"
                    className={`flex-1 min-w-0 bg-[var(--panel-2)] border border-[var(--border)] rounded px-2 py-1 text-[10px] font-mono text-text outline-none focus:border-accent resize-y ${showKey[pid] ? '' : 'text-transparent caret-text selection:bg-accent/40 [text-shadow:0_0_8px_var(--text)]'}`}
                  />
                ) : (
                  <input
                    type={showKey[pid] ? 'text' : 'password'}
                    value={keys[pid]}
                    onChange={e => updateKey(pid, e.target.value)}
                    placeholder={provider.keyLabel}
                    className="flex-1 min-w-0 bg-[var(--panel-2)] border border-[var(--border)] rounded px-2 py-1 text-[11px] text-text outline-none focus:border-accent"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setShowKey(prev => ({ ...prev, [pid]: !prev[pid] }))}
                  title={showKey[pid] ? t('hideKey') : t('showKey')}
                  className={`shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-[var(--panel-2)] transition-colors ${indicatorClass}`}
                >
                  {showKey[pid] ? '◎' : '●'}
                </button>
                <button
                  type="button"
                  onClick={() => handleTestKey(pid)}
                  disabled={!keys[pid].trim() || testingKey === pid}
                  className="shrink-0 px-2 h-7 rounded-md border border-[var(--border)] text-[10px] text-text hover:bg-[var(--panel-2)] disabled:opacity-40 disabled:cursor-default"
                >
                  {testingKey === pid ? '…' : t('test')}
                </button>
              </div>
              {pid === 'bedrock' && (
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="text-[10px] text-muted">{t('bedrockRegion')}</span>
                  <ChatSelect
                    className="w-[220px]"
                    buttonClassName="h-6 px-2 text-[10px]"
                    ariaLabel={t('bedrockRegion')}
                    align="right"
                    value={bedrockRegion}
                    options={BEDROCK_REGIONS.map(r => ({ id: r.id, label: r.label }))}
                    onChange={(id) => { setBedrockRegionState(id); setBedrockRegion(id); }}
                  />
                </div>
              )}
            </div>
          );
        })}
        <p className="text-[10px] text-muted leading-snug">{t('keysNote')}</p>
      </div>
    </SectionShell>
  );
}

// --- Section: MCP Servers --------------------------------------------------

function McpSection() {
  const t = useTranslations('settings');
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, McpServerStatus>>({});
  const [editing, setEditing] = useState<McpServerConfig | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const list = listMcpServers();
    setServers(list);
    const manager = getMcpManager();
    const next: Record<string, McpServerStatus> = {};
    for (const s of list) next[s.id] = manager.getStatus(s.id);
    setStatusMap(next);
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener('mcp:servers-changed', onChange);
    window.addEventListener('mcp:status-changed', onChange);
    return () => {
      window.removeEventListener('mcp:servers-changed', onChange);
      window.removeEventListener('mcp:status-changed', onChange);
    };
  }, [refresh]);

  const handleSave = (next: McpServerConfig) => {
    if (servers.some(s => s.id === next.id)) updateMcpServer(next);
    else addMcpServer(next);
    setShowForm(false);
    setEditing(null);
  };

  const handleSaveMany = (batch: McpServerConfig[]) => {
    for (const cfg of batch) {
      // If the user imported a config whose URL already exists, treat it as
      // an update of the existing row so re-pasting an updated token doesn't
      // create duplicate entries.
      const dup = servers.find(s => s.url === cfg.url);
      if (dup) updateMcpServer({ ...dup, ...cfg, id: dup.id, enabled: dup.enabled });
      else addMcpServer(cfg);
    }
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm(t('mcpConfirmDelete'))) return;
    deleteMcpServer(id);
  };

  const handleToggle = (s: McpServerConfig) => {
    updateMcpServer({ ...s, enabled: !s.enabled });
  };

  const handleTest = async (s: McpServerConfig) => {
    setTestingId(s.id);
    try {
      const tools = await getMcpManager().probeServer(s);
      showToast(t('mcpTestOk', { count: tools.length }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(t('mcpTestFailed', { message }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <SectionShell title={t('sectionMcp')}>
      <p className="text-[11px] text-muted leading-snug mb-3">{t('mcpDescription')}</p>

      {servers.length === 0 && !showForm && (
        <div className="px-3 py-6 text-xs text-muted text-center border border-dashed border-[var(--border)] rounded-md">
          {t('mcpEmpty')}
        </div>
      )}

      {servers.length > 0 && (
        <div className="space-y-2 mb-3">
          {servers.map(s => {
            const status = statusMap[s.id] ?? { state: s.enabled ? 'connecting' : 'disabled', toolCount: 0 };
            return (
              <div key={s.id} className="border border-[var(--border)] rounded-md p-2.5 bg-[var(--panel-2)]/40">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-text truncate">{s.name}</span>
                      <StatusBadge status={status} />
                    </div>
                    <div className="text-[10px] text-muted font-mono truncate mt-0.5">{s.url}</div>
                    <div className="text-[10px] text-muted mt-0.5">
                      {t('mcpTransportLabel', { transport: s.transport.toUpperCase() })}
                      {status.state === 'connected' && status.toolCount > 0
                        ? ` · ${t('mcpToolsCount', { count: status.toolCount })}`
                        : ''}
                      {status.state === 'error' && status.error
                        ? ` · ${status.error}`
                        : ''}
                    </div>
                  </div>
                  <Toggle on={s.enabled} onToggle={() => handleToggle(s)} label={t('mcpEnableLabel')} />
                </div>
                <div className="flex gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => handleTest(s)}
                    disabled={testingId === s.id}
                    className="px-2 h-7 rounded-md border border-[var(--border)] text-[10px] text-text hover:bg-[var(--panel)] disabled:opacity-40"
                  >
                    {testingId === s.id ? '…' : t('mcpTest')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(s); setShowForm(true); }}
                    className="px-2 h-7 rounded-md border border-[var(--border)] text-[10px] text-text hover:bg-[var(--panel)]"
                  >
                    {t('mcpEdit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
                    className="px-2 h-7 rounded-md border border-[var(--border)] text-[10px] text-bad/80 hover:text-bad hover:bg-[var(--panel)]"
                  >
                    {t('mcpDelete')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <McpServerForm
          initial={editing}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSave={handleSave}
          onSaveMany={handleSaveMany}
        />
      )}

      {!showForm && (
        <button
          type="button"
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md border border-dashed border-[var(--border)] text-xs text-muted hover:text-text hover:bg-[var(--panel-2)]"
        >
          + {t('mcpAddServer')}
        </button>
      )}
    </SectionShell>
  );
}

function StatusBadge({ status }: { status: McpServerStatus }) {
  const t = useTranslations('settings');
  let label = '';
  let cls = '';
  switch (status.state) {
    case 'connected':  label = t('mcpStatusConnected');  cls = 'bg-good/15 text-good'; break;
    case 'connecting': label = t('mcpStatusConnecting'); cls = 'bg-accent/15 text-accent'; break;
    case 'error':      label = t('mcpStatusError');      cls = 'bg-bad/15 text-bad'; break;
    case 'disabled':   label = t('mcpStatusDisabled');   cls = 'bg-[var(--panel)] text-muted'; break;
  }
  return (
    <span className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded ${cls}`}>{label}</span>
  );
}

interface McpFormProps {
  initial: McpServerConfig | null;
  onCancel: () => void;
  onSave: (next: McpServerConfig) => void;
  /** Called when JSON mode imports multiple servers in one paste. */
  onSaveMany?: (next: McpServerConfig[]) => void;
}

type FormMode = 'form' | 'json';

const JSON_PLACEHOLDER = `{
  "mcpServers": {
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "type": "http",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}`;

function McpServerForm({ initial, onCancel, onSave, onSaveMany }: McpFormProps) {
  const t = useTranslations('settings');
  // JSON mode is hidden while editing an existing server — pasting a config
  // there would either replace the row's id (silent breakage) or import a
  // brand-new one (surprising). Editing stays form-only.
  const [mode, setMode] = useState<FormMode>('form');
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [transport, setTransport] = useState<McpTransport>(initial?.transport ?? 'http');
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>(() => {
    const entries = Object.entries(initial?.headers ?? {});
    return entries.length > 0 ? entries.map(([k, v]) => ({ key: k, value: v })) : [{ key: '', value: '' }];
  });
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (mode === 'json') {
      let parsed: McpServerConfig[];
      try { parsed = parseMcpServersJson(jsonText); }
      catch (err) { setError(err instanceof Error ? err.message : String(err)); return; }
      if (parsed.length === 0) { setError(t('mcpFormErrorJsonEmpty')); return; }
      if (onSaveMany) onSaveMany(parsed);
      else parsed.forEach(onSave);
      return;
    }
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName) { setError(t('mcpFormErrorName')); return; }
    if (!trimmedUrl) { setError(t('mcpFormErrorUrl')); return; }
    try {
      new URL(trimmedUrl);
    } catch {
      setError(t('mcpFormErrorUrlInvalid'));
      return;
    }
    const headerMap: Record<string, string> = {};
    for (const h of headers) {
      const k = h.key.trim();
      const v = h.value.trim();
      if (k && v) headerMap[k] = v;
    }
    onSave({
      id: initial?.id ?? randomId(),
      name: trimmedName,
      url: trimmedUrl,
      transport,
      headers: Object.keys(headerMap).length > 0 ? headerMap : undefined,
      enabled: initial?.enabled ?? true,
    });
  };

  return (
    <div className="border border-[var(--border)] rounded-md p-3 bg-[var(--panel-2)]/60 space-y-2 mb-3">
      {!initial && (
        <div className="flex items-center justify-between gap-2">
          <Segmented
            value={mode}
            options={[
              { value: 'form', label: t('mcpFormModeForm') },
              { value: 'json', label: t('mcpFormModeJson') },
            ]}
            onChange={(v) => { setMode(v as FormMode); setError(null); }}
          />
        </div>
      )}

      {mode === 'json' ? (
        <div className="space-y-1">
          <label className="text-[10px] text-muted">{t('mcpFormJsonLabel')}</label>
          <textarea
            value={jsonText}
            onChange={e => setJsonText(e.target.value)}
            placeholder={JSON_PLACEHOLDER}
            spellCheck={false}
            wrap="off"
            rows={12}
            className="w-full bg-[var(--panel)] border border-[var(--border)] rounded px-2 py-1.5 text-[11px] font-mono text-text outline-none focus:border-accent resize-y"
          />
          <p className="text-[10px] text-muted leading-snug">{t('mcpFormJsonHint')}</p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <label className="text-[10px] text-muted">{t('mcpFormName')}</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('mcpFormNamePlaceholder')}
              className="w-full bg-[var(--panel)] border border-[var(--border)] rounded px-2 py-1 text-xs text-text outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted">{t('mcpFormUrl')}</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              spellCheck={false}
              className="w-full bg-[var(--panel)] border border-[var(--border)] rounded px-2 py-1 text-xs font-mono text-text outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[10px] text-muted">{t('mcpFormTransport')}</label>
            <Segmented
              value={transport}
              options={[
                { value: 'http', label: 'HTTP' },
                { value: 'sse',  label: 'SSE' },
              ]}
              onChange={(v) => setTransport(v as McpTransport)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted">{t('mcpFormHeaders')}</label>
            <div className="space-y-1">
              {headers.map((h, i) => (
                <div key={i} className="flex gap-1">
                  <input
                    value={h.key}
                    onChange={e => setHeaders(prev => prev.map((x, idx) => idx === i ? { ...x, key: e.target.value } : x))}
                    placeholder="Authorization"
                    spellCheck={false}
                    className="flex-1 min-w-0 bg-[var(--panel)] border border-[var(--border)] rounded px-2 py-1 text-[11px] font-mono text-text outline-none focus:border-accent"
                  />
                  <input
                    value={h.value}
                    onChange={e => setHeaders(prev => prev.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x))}
                    placeholder="Bearer …"
                    spellCheck={false}
                    type="password"
                    className="flex-1 min-w-0 bg-[var(--panel)] border border-[var(--border)] rounded px-2 py-1 text-[11px] font-mono text-text outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setHeaders(prev => prev.length === 1 ? [{ key: '', value: '' }] : prev.filter((_, idx) => idx !== i))}
                    className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md text-muted hover:text-bad hover:bg-[var(--panel)]"
                    aria-label={t('mcpFormRemoveHeader')}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setHeaders(prev => [...prev, { key: '', value: '' }])}
                className="text-[10px] text-accent hover:underline"
              >
                + {t('mcpFormAddHeader')}
              </button>
            </div>
          </div>
        </>
      )}

      {error && <div className="text-[11px] text-bad">{error}</div>}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={submit}
          className="px-3 h-7 rounded-md border border-accent bg-accent/15 text-accent text-xs hover:bg-accent/25"
        >
          {mode === 'json' ? t('mcpFormImport') : t('mcpFormSave')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 h-7 rounded-md border border-[var(--border)] text-xs text-muted hover:text-text hover:bg-[var(--panel)]"
        >
          {t('mcpFormCancel')}
        </button>
      </div>
    </div>
  );
}

// --- Section: Danger zone --------------------------------------------------

interface DangerProps {
  onClearChats?: () => Promise<void> | void;
  onResetVault?: () => Promise<void> | void;
}

function DangerSection(p: DangerProps) {
  const t = useTranslations('settings');
  const tToast = useTranslations('toast');
  const [keys, setKeys] = useState<Record<ProviderId, string>>(() => emptyMap(''));

  useEffect(() => {
    setKeys(Object.fromEntries(PROVIDER_IDS.map(pid => [pid, getApiKey(pid)])) as Record<ProviderId, string>);
  }, []);

  const handleClearChats = async () => {
    if (!p.onClearChats) return;
    if (!window.confirm(t('confirmClearChats'))) return;
    try {
      await Promise.resolve(p.onClearChats());
      showToast(tToast('chatsCleared'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tToast('failedClearChats'));
    }
  };

  const handleResetVault = async () => {
    if (!p.onResetVault) return;
    if (!window.confirm(t('confirmResetVault'))) return;
    await Promise.resolve(p.onResetVault());
  };

  const handleClearAllKeys = () => {
    if (!window.confirm(t('confirmClearAllKeys'))) return;
    clearAllApiKeys();
    setKeys(emptyMap(''));
    showToast(tToast('keysCleared'));
  };

  // Reference `keys` to avoid an unused-state warning while the destructive
  // section may later surface per-provider clear affordances.
  void keys;

  return (
    <SectionShell title={t('sectionDanger')}>
      <p className="text-[11px] text-muted leading-snug mb-3">{t('dangerDescription')}</p>
      <div className="space-y-2">
        <button
          type="button"
          onClick={handleClearAllKeys}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md border border-[var(--border)] text-[11px] text-bad/80 hover:text-bad hover:bg-[var(--panel-2)]"
          title={t('clearAllKeysHint')}
        >
          {t('clearAllKeys')}
        </button>
        {p.onClearChats && (
          <button
            type="button"
            onClick={handleClearChats}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md border border-[var(--border)] text-[11px] text-bad/80 hover:text-bad hover:bg-[var(--panel-2)]"
          >
            {t('clearChats')}
          </button>
        )}
        {p.onResetVault && (
          <button
            type="button"
            onClick={handleResetVault}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md border border-[var(--border)] text-[11px] text-bad/80 hover:text-bad hover:bg-[var(--panel-2)]"
            title={t('resetVaultHint')}
          >
            {t('resetVault')}
          </button>
        )}
      </div>
    </SectionShell>
  );
}

// --- Shared primitives -----------------------------------------------------

function SectionShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[11px] uppercase tracking-wide text-accent font-semibold mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label?: string }) {
  return (
    <button type="button" onClick={onToggle} aria-label={label} aria-pressed={on}
      className={`w-8 h-[18px] rounded-full transition-colors relative ${on ? 'bg-accent' : 'bg-[var(--border)]'}`}>
      <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${on ? 'left-[16px]' : 'left-[2px]'}`} />
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--panel)] p-0.5 shadow-sm">
      {options.map(opt => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={selected}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              selected ? 'bg-[var(--panel-2)] text-text shadow-sm' : 'text-muted hover:text-text'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function randomId(): string {
  return `mcp-${Math.random().toString(36).slice(2, 10)}`;
}
