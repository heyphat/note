import webpack from 'next/dist/compiled/webpack/webpack-lib.js';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // StrictMode double-invokes mount effects in dev only (no-op in prod).
  // Crepe / Milkdown's async `editor.create()` chain races against its own
  // teardown under that pattern and the wikilink plugin's decorations don't
  // end up on the second mount's editor view. Disabled to keep dev parity
  // with production until the editor's mount lifecycle is made
  // StrictMode-safe.
  reactStrictMode: false,
  // Emits `.next/standalone` — a self-contained server with only the
  // node_modules it actually traced. Used by the Dockerfile; additive, so
  // `next start` and Vercel deploys are unaffected.
  output: 'standalone',
  webpack: (config) => {
    config.plugins.push(
      new webpack.DefinePlugin({
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_DEVTOOLS__: 'false',
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
      })
    );
    return config;
  },
};

export default withNextIntl(nextConfig);
