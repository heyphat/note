import React from 'react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChatMessage from './ChatMessage';
import { renderWithIntl as render } from '@/utils/test/intl';

describe('ChatMessage', () => {
  it('shows the streaming indicator even before assistant text arrives', () => {
    const { container } = render(
      <ChatMessage role="assistant" content="" streaming />,
    );

    expect(screen.getByLabelText('Assistant is streaming')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-stream-dot]').length).toBe(3);
  });

  it('renders quoted selected text in a user message without raw quote markers', () => {
    const { container } = render(
      <ChatMessage role="user" content={'> Psychology & Reflection\n\nexplain this to me'} />,
    );

    expect(screen.getByText('Psychology & Reflection')).toBeInTheDocument();
    expect(screen.getByText('explain this to me')).toBeInTheDocument();
    expect(container.textContent).not.toContain('>');
  });
});
