'use client';

// Renders assistant messages as React components (not HTML strings) so the
// browser's text selection survives streaming token updates and re-renders.
// The previous implementation used dangerouslySetInnerHTML, which replaced the
// entire DOM subtree on every content change and broke any in-progress
// selection inside the bubble.

import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
}

const components: Components = {
  a: ({ href, children, ...rest }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  ),
};

export default function ChatMarkdown({ content }: Props) {
  return (
    <div
      className="whitespace-normal break-words
        [&_h1]:mt-0 [&_h1]:mb-3 [&_h1]:text-[1.05rem] [&_h1]:font-semibold [&_h1]:leading-[1.35]
        [&_h2]:mt-0 [&_h2]:mb-3 [&_h2]:text-[0.98rem] [&_h2]:font-semibold [&_h2]:leading-[1.35]
        [&_h3]:mt-0 [&_h3]:mb-2 [&_h3]:text-[0.92rem] [&_h3]:font-semibold [&_h3]:leading-[1.4]
        [&_h4]:mt-0 [&_h4]:mb-2 [&_h4]:text-[0.88rem] [&_h4]:font-semibold
        [&_h5]:mt-0 [&_h5]:mb-2 [&_h5]:text-[0.84rem] [&_h5]:font-semibold
        [&_h6]:mt-0 [&_h6]:mb-2 [&_h6]:text-[0.82rem] [&_h6]:font-semibold
        [&_p]:m-0 [&_p+p]:mt-3
        [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5
        [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5
        [&_li]:my-1
        [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border)] [&_blockquote]:pl-3 [&_blockquote]:text-muted
        [&_hr]:my-4 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-[var(--border)]
        [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-[var(--border)]
        [&_pre]:bg-[color-mix(in_srgb,var(--panel)_76%,black_6%)] [&_pre]:px-3 [&_pre]:py-2.5
        [&_pre]:text-[12px] [&_pre]:leading-[1.55]
        [&_code]:rounded-[4px] [&_code]:bg-[color-mix(in_srgb,var(--panel)_82%,black_4%)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.92em]
        [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit
        [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2
        [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-md
        [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left
        [&_th]:border [&_th]:border-[var(--border)] [&_th]:bg-[var(--panel)] [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:font-semibold
        [&_td]:border [&_td]:border-[var(--border)] [&_td]:px-2.5 [&_td]:py-1.5
        [&_strong]:font-semibold [&_em]:italic [&_del]:line-through [&_del]:opacity-75"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
