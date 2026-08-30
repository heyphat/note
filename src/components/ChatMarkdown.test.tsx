import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChatMarkdown from './ChatMarkdown';

describe('ChatMarkdown', () => {
  it('renders markdown structure for assistant messages', () => {
    const { container } = render(
      <ChatMarkdown content={`# Title\n\n- first item\n- **second** item\n\nVisit [site](https://example.com)`} />,
    );

    expect(container.querySelector('h1')?.textContent).toBe('Title');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('strong')?.textContent).toBe('second');
    expect(screen.getByRole('link', { name: 'site' })).toHaveAttribute('href', 'https://example.com');
    expect(screen.getByRole('link', { name: 'site' })).toHaveAttribute('target', '_blank');
  });
});
