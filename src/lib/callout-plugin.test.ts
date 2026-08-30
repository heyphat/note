import { describe, expect, it } from 'vitest';
import { parseCalloutMarker } from './callout-plugin';

describe('parseCalloutMarker', () => {
  it('parses a standard callout marker', () => {
    expect(parseCalloutMarker('[!NOTE]')).toEqual({
      type: 'note',
      tone: 'note',
      title: 'NOTE',
      fold: null,
    });
  });

  it('parses custom titles and known tones', () => {
    expect(parseCalloutMarker('[!warning] Risk setup')).toEqual({
      type: 'warning',
      tone: 'warning',
      title: 'Risk setup',
      fold: null,
    });
  });

  it('parses Obsidian-style fold markers', () => {
    expect(parseCalloutMarker('[!tip]+ Expand this')?.fold).toBe('open');
    expect(parseCalloutMarker('[!danger]- Hide this')?.fold).toBe('closed');
  });

  it('accepts custom callout types with the default tone', () => {
    expect(parseCalloutMarker('[!trade-plan] London session')).toEqual({
      type: 'trade-plan',
      tone: 'note',
      title: 'London session',
      fold: null,
    });
  });

  it('rejects non-callout text', () => {
    expect(parseCalloutMarker('NOTE')).toBeNull();
    expect(parseCalloutMarker('[NOTE]')).toBeNull();
    expect(parseCalloutMarker('[!]')).toBeNull();
  });
});
