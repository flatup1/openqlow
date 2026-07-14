import { describe, it, expect } from 'vitest';
import { validateImageFile, formatBytes } from '../src/utils/fileValidation';

function makeFile(type: string, size: number): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], 'x', { type });
}

describe('validateImageFile', () => {
  it('accepts PNG under the limit', () => {
    expect(validateImageFile(makeFile('image/png', 1000)).ok).toBe(true);
  });
  it('rejects unsupported type', () => {
    const r = validateImageFile(makeFile('image/gif', 1000));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('PNG');
  });
  it('rejects too-large files', () => {
    const r = validateImageFile(makeFile('image/png', 11 * 1024 * 1024));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('10MB');
  });
  it('rejects empty files', () => {
    expect(validateImageFile(makeFile('image/png', 0)).ok).toBe(false);
  });
});

describe('formatBytes', () => {
  it('formats units', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
