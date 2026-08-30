import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
});

markdown.use(footnote);

const defaultLinkOpen = markdown.renderer.rules.link_open
  ?? ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return defaultLinkOpen(tokens, idx, options, env, self);
};

export function markdownToHtml(source: string): string {
  return markdown.render(source).trimEnd();
}
