import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'vi'],
  defaultLocale: 'en',
  localePrefix: 'always',
  localeDetection: true,
});

export type Locale = (typeof routing.locales)[number];
