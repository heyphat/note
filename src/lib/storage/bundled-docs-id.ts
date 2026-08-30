// Tiny module that holds the bundled-docs vault-id helpers without pulling
// in the multi-hundred-KB docs manifest. Importing this from the FS-only
// path lets webpack code-split BundledDocsStore + DOCS_BUNDLES into a chunk
// that's only loaded for first-time users.

export const BUILTIN_DOCS_VAULT_PREFIX = 'builtin-docs-';

export function isBundledDocsVaultId(vaultId: string | undefined | null): boolean {
  return !!vaultId && vaultId.startsWith(BUILTIN_DOCS_VAULT_PREFIX);
}

export type DocsLocale = 'en' | 'vi';

export function normalizeDocsLocale(input: string | undefined): DocsLocale {
  return input === 'vi' ? 'vi' : 'en';
}
