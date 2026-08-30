import { describe, it, expect } from 'vitest';
import { interpolateTemplateVariables } from './template-variables';

describe('interpolateTemplateVariables', () => {
  it('substitutes the built-in date token', () => {
    const out = interpolateTemplateVariables('# {{date}}');
    // The exact value depends on the local clock; just check the shape.
    expect(out).toMatch(/^# \d{4}-\d{2}-\d{2}$/);
  });

  it('leaves unknown tokens untouched', () => {
    const out = interpolateTemplateVariables('hello {{nope}}');
    expect(out).toBe('hello {{nope}}');
  });

  it('substitutes dotted-path tokens supplied via extras', () => {
    const out = interpolateTemplateVariables('## Today\n{{tasks.today}}', {
      'tasks.today': '- [ ] One\n- [ ] Two',
    });
    expect(out).toBe('## Today\n- [ ] One\n- [ ] Two');
  });

  it('extras take precedence over missing built-ins', () => {
    const out = interpolateTemplateVariables('{{custom}}', { custom: 'hi' });
    expect(out).toBe('hi');
  });

  it('built-in date tokens still work alongside extras', () => {
    const out = interpolateTemplateVariables('{{date}} — {{tasks.today}}', {
      'tasks.today': '- [ ] One',
    });
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} — - \[ \] One$/);
  });
});
