import React from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../../locale/en.json';

export function renderWithIntl(ui: React.ReactElement, options?: RenderOptions): RenderResult {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
  return render(ui, { wrapper: Wrapper, ...options });
}
