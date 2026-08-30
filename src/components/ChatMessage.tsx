'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import ChatMarkdown from './ChatMarkdown';
import type { ChatRole } from '@/lib/storage';

interface Props {
  role: ChatRole;
  content: string;
  streaming?: boolean;
}

function parseQuotedUserMessage(content: string): { quote: string; body: string } | null {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized.startsWith('>')) return null;
  const separatorIndex = normalized.indexOf('\n\n');
  if (separatorIndex < 0) return null;
  const quoteBlock = normalized.slice(0, separatorIndex);
  const body = normalized.slice(separatorIndex + 2).trim();
  const quoteLines = quoteBlock.split('\n');
  if (!body || quoteLines.some(line => !/^>\s?/.test(line))) return null;
  const quote = quoteLines
    .map(line => line.replace(/^>\s?/, ''))
    .join('\n')
    .trim();
  return quote ? { quote, body } : null;
}

export default function ChatMessage({ role, content, streaming }: Props) {
  const t = useTranslations('chatMessage');
  const isUser = role === 'user';
  const label = isUser ? t('labelYou') : role === 'assistant' ? t('labelAssistant') : t('labelSystem');
  const showStreamingDots = streaming && !isUser;
  const hasContent = content.trim().length > 0;
  const quotedUserMessage = isUser ? parseQuotedUserMessage(content) : null;

  return (
    <div
      className={`group flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted">
        {label}
      </div>
      <div
        data-chat-message-role={role}
        className={`max-w-full rounded-lg px-3 py-2 text-[13px] leading-[1.55] whitespace-pre-wrap break-words
          ${showStreamingDots ? 'flex flex-col' : ''}
          ${showStreamingDots && !hasContent ? 'min-h-[40px] min-w-[88px] justify-center' : ''}
          ${isUser
            ? 'bg-accent text-white'
            : 'bg-[var(--panel-2)] border border-[var(--border)] text-text'}`}
      >
        {hasContent ? (
          isUser ? (
            quotedUserMessage ? (
              <div className="space-y-2">
                <blockquote className="rounded-md border-l-2 border-white/45 bg-white/10 px-2 py-1.5 text-white/85">
                  {quotedUserMessage.quote}
                </blockquote>
                <div>{quotedUserMessage.body}</div>
              </div>
            ) : (
              <div>{content}</div>
            )
          ) : <ChatMarkdown content={content} />
        ) : null}
        {showStreamingDots ? (
          <div
            role="status"
            aria-label={t('streamingAria')}
            className={`flex items-center gap-1 text-muted ${hasContent ? 'mt-2' : ''}`}
          >
            <span
              data-stream-dot="1"
              className="h-2 w-2 rounded-full bg-current animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <span
              data-stream-dot="2"
              className="h-2 w-2 rounded-full bg-current animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <span
              data-stream-dot="3"
              className="h-2 w-2 rounded-full bg-current animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
