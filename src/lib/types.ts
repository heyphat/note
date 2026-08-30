export interface GeneralNoteMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** File size in bytes — used by the client's vault cache to diff files. */
  size?: number;
  /** File mtime (ms since epoch) — used by the client's vault cache to diff files. */
  mtimeMs?: number;
}
