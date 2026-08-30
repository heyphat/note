import { describe, expect, it } from 'vitest';
import { parseYouTubeEmbed } from './youtube-render';

describe('parseYouTubeEmbed', () => {
  it('parses standard watch URLs', () => {
    expect(parseYouTubeEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      videoId: 'dQw4w9WgXcQ',
      startSeconds: 0,
    });
  });

  it('parses short URLs and timestamps', () => {
    expect(parseYouTubeEmbed('https://youtu.be/dQw4w9WgXcQ?t=1m30s')).toEqual({
      videoId: 'dQw4w9WgXcQ',
      startSeconds: 90,
    });
  });

  it('parses shorts, live, embed, and raw ids', () => {
    expect(parseYouTubeEmbed('https://youtube.com/shorts/dQw4w9WgXcQ')?.videoId).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeEmbed('https://youtube.com/live/dQw4w9WgXcQ')?.videoId).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeEmbed('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')?.videoId).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeEmbed('dQw4w9WgXcQ')?.videoId).toBe('dQw4w9WgXcQ');
  });

  it('rejects invalid or non-youtube URLs', () => {
    expect(parseYouTubeEmbed('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeEmbed('not a url')).toBeNull();
    expect(parseYouTubeEmbed('https://youtube.com/watch?v=short')).toBeNull();
  });
});
