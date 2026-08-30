import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: [
    // Exclude `.json` so static files in /public (e.g. /docs-bundle/<locale>.json)
    // bypass next-intl's locale routing — otherwise an unauthenticated fetch to
    // `/docs-bundle/en.json` gets 308'd into a localized variant that doesn't exist.
    '/((?!api|_next|[^?]*\\.(?:html?|css|jsx?|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
};
