import { saveHandle, loadHandle } from '../handle-db';
import type { VaultStatus } from '../types';
// Side-effect import: registers queryPermission/requestPermission on FileSystemHandle.
import './fs-helpers';

/**
 * Owns the only `FileSystemDirectoryHandle` in the system. Sub-stores hold a
 * reference and call `requireHandle()` whenever they need the root — they
 * never cache the handle themselves, so a re-pick after a vault switch is
 * automatically picked up.
 */
export class PermissionsController {
  private dirHandle: FileSystemDirectoryHandle | null = null;
  private vaultId = '';
  /** Hook fired after a successful `pickDirectory()`. The façade uses this to
   *  clear the AssetStore's blob URL cache so URLs from the previous vault
   *  don't leak into the new one. */
  onPickComplete?: () => void;

  constructor(private userId: string) {}

  async isReady(): Promise<boolean> {
    if (!this.dirHandle) return false;
    const perm = await this.dirHandle.queryPermission({ mode: 'readwrite' });
    return perm === 'granted';
  }

  async initialize(): Promise<VaultStatus> {
    if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
      return { ready: false, label: 'Your browser does not support the File System Access API. Please use Chrome, Edge, or Brave.' };
    }
    const saved = await loadHandle(this.userId);
    if (saved) {
      const perm = await saved.handle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        this.dirHandle = saved.handle;
        this.vaultId = saved.vaultId;
        return { ready: true, label: saved.label, vaultId: saved.vaultId };
      }
      if (perm === 'prompt') {
        return { ready: false, needsPicker: true, label: saved.label, vaultId: saved.vaultId };
      }
    }
    return { ready: false, needsPicker: true };
  }

  async pickDirectory(opts?: { forceNew?: boolean }): Promise<boolean> {
    // Silent re-grant path. queryPermission is synchronous enough to preserve
    // the user's click activation; requestPermission needs it, so keep these
    // calls before any IDB work. loadHandle is the risky one — its IDB await
    // can erase transient activation in some browsers, which makes the
    // subsequent showDirectoryPicker throw SecurityError. We only run it
    // when forceNew is false, and short-circuit on any failure to the picker.
    if (!opts?.forceNew) {
      try {
        const saved = await loadHandle(this.userId);
        if (saved) {
          const perm = await saved.handle.requestPermission({ mode: 'readwrite' });
          if (perm === 'granted') {
            this.dirHandle = saved.handle;
            this.vaultId = saved.vaultId;
            return true;
          }
        }
      } catch (err) {
        console.warn('[notes] silent re-grant failed, falling back to picker', err);
      }
    }
    // The native directory picker. AbortError = user cancelled the dialog;
    // swallow that one quietly. Anything else bubbles up so the caller can
    // surface it instead of the screen looking dead on click.
    try {
      const handle = await (window as unknown as { showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle> })
        .showDirectoryPicker({ mode: 'readwrite' });
      const saved = await saveHandle(this.userId, handle);
      this.dirHandle = saved.handle;
      this.vaultId = saved.vaultId;
      this.onPickComplete?.();
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return false;
      throw err;
    }
  }

  requireHandle(): FileSystemDirectoryHandle {
    if (!this.dirHandle) throw new Error('Notes directory not selected');
    return this.dirHandle;
  }

  /**
   * Exposed so the search layer can hand a cloned handle to a Web Worker
   * for off-main-thread file reads during indexing. Returns null before
   * initialize() / pickDirectory() has resolved.
   */
  getDirectoryHandle(): FileSystemDirectoryHandle | null {
    return this.dirHandle;
  }

  getVaultId(): string {
    return this.vaultId;
  }
}
