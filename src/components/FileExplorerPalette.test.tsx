import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../locale/vi.json';

vi.mock('@/components/Toast', () => ({
  showToast: vi.fn(),
}));

import FileExplorerPalette from './FileExplorerPalette';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="vi" messages={messages}>{children}</NextIntlClientProvider>
);

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

type PaletteProps = React.ComponentProps<typeof FileExplorerPalette>;

function renderPalette(overrides: Partial<PaletteProps> = {}) {
  const props: PaletteProps = {
    open: true,
    onClose: vi.fn(),
    notes: [{
      id: 'unsorted/demo.md',
      title: 'Demo',
      createdAt: '2026-04-25T00:00:00.000Z',
      updatedAt: '2026-04-25T00:00:00.000Z',
    }],
    folders: ['unsorted'],
    activeId: null,
    expanded: new Set<string>(),
    onToggleFolder: vi.fn(),
    pinned: new Set<string>(),
    onTogglePin: vi.fn(),
    onSelectNote: vi.fn(),
    onMove: vi.fn(),
    onDelete: vi.fn(),
    onRenameFolder: vi.fn(),
    onCreateNote: vi.fn(async () => undefined),
    onCreateFolder: vi.fn(async () => undefined),
    ...overrides,
  };
  return render(<FileExplorerPalette {...props} />, { wrapper });
}

describe('FileExplorerPalette', () => {
  beforeEach(() => {
    window.localStorage.clear();
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  });

  it('renders translated file explorer chrome in Vietnamese', () => {
    renderPalette();

    expect(screen.getByRole('button', { name: 'Cây' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cột' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Danh sách' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưới' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Ghi chú' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Thư mục' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Lọc các mục đang hiển thị…')).toBeInTheDocument();
    expect(screen.getByText('F2 đổi tên · Cmd+Backspace xóa · Cmd+N ghi chú · Cmd+Shift+N thư mục')).toBeInTheDocument();
  });

  it('renames folders from the context menu in columns view', () => {
    const onRenameFolder = vi.fn();
    renderPalette({ onRenameFolder });

    fireEvent.click(screen.getByRole('button', { name: 'Cột' }));
    fireEvent.contextMenu(screen.getByText('unsorted'));
    fireEvent.click(screen.getByRole('button', { name: 'Đổi tên' }));

    const input = screen.getByDisplayValue('unsorted');
    fireEvent.change(input, { target: { value: 'archive' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRenameFolder).toHaveBeenCalledWith('unsorted', 'archive');
  });

  it('creates folders from grid view', async () => {
    const onCreateFolder = vi.fn(async () => undefined);
    renderPalette({ onCreateFolder });

    fireEvent.click(screen.getByRole('button', { name: 'Lưới' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Thư mục' }));

    const input = screen.getByPlaceholderText('Thư mục mới…');
    fireEvent.change(input, { target: { value: 'new-folder' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(onCreateFolder).toHaveBeenCalledWith('', 'new-folder');
  });

  it('keeps the context menu open for delete confirmation', () => {
    const onDelete = vi.fn();
    renderPalette({ onDelete });

    fireEvent.click(screen.getByRole('button', { name: 'Cột' }));
    fireEvent.contextMenu(screen.getByText('unsorted'));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));

    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xoá' }));

    expect(onDelete).toHaveBeenCalledWith('unsorted');
  });
});
