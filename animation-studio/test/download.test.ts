import { describe, it, expect } from 'vitest';
import { buildDownloadFilename } from '../src/utils/download';

describe('buildDownloadFilename', () => {
  it('formats as flatup-animation-YYYYMMDD-HHMMSS.mp4', () => {
    const d = new Date(2026, 6, 14, 9, 15, 0); // 2026-07-14 09:15:00
    expect(buildDownloadFilename(d)).toBe('flatup-animation-20260714-091500.mp4');
  });
  it('accepts ISO string', () => {
    const name = buildDownloadFilename('2026-01-02T03:04:05');
    expect(name).toMatch(/^flatup-animation-20260102-030405\.mp4$/);
  });
});
