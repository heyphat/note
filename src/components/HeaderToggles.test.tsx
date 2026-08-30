import React from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../locale/vi.json';
import {
  BacklinksToggle,
  GraphToggle,
  HistoryPanelToggle,
  SidebarToggle,
} from './HeaderToggles';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="vi" messages={messages}>{children}</NextIntlClientProvider>
);

describe('HeaderToggles', () => {
  it('renders translated labels for the header actions', () => {
    render(
      <>
        <BacklinksToggle open={false} count={3} onClick={vi.fn()} />
        <HistoryPanelToggle open={false} onClick={vi.fn()} />
        <GraphToggle onClick={vi.fn()} />
        <SidebarToggle open={false} onClick={vi.fn()} />
      </>,
      { wrapper },
    );

    expect(screen.getByRole('button', { name: 'Hiện liên kết ngược' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hiện lịch sử' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chế độ xem đồ thị' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hiện thanh bên' })).toBeInTheDocument();
  });
});
