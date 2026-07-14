import { describe, it, expect } from 'vitest';
import { buildPrompt, countChars, CONSISTENCY_NOTE } from '../src/utils/promptBuilder';

describe('buildPrompt', () => {
  it('appends the consistency note', () => {
    const out = buildPrompt({ prompt: 'ジャブを打つ' });
    expect(out).toContain('ジャブを打つ');
    expect(out).toContain(CONSISTENCY_NOTE);
  });
  it('returns empty string for blank input', () => {
    expect(buildPrompt({ prompt: '   ' })).toBe('');
  });
});

describe('countChars', () => {
  it('counts unicode code points', () => {
    expect(countChars('あいう')).toBe(3);
    expect(countChars('')).toBe(0);
  });
});
