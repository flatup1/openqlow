import { describe, it, expect } from 'vitest';
import { generationSchema } from '../server/schemas/videoSchemas';

describe('generationSchema', () => {
  it('accepts valid input and applies defaults', () => {
    const r = generationSchema.safeParse({ prompt: 'ジャブ', duration: '5' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.duration).toBe(5);
      expect(r.data.aspectRatio).toBe('9:16');
      expect(r.data.motionStrength).toBe('medium');
    }
  });
  it('rejects empty prompt', () => {
    expect(generationSchema.safeParse({ prompt: '', duration: 5 }).success).toBe(false);
  });
  it('rejects out-of-range duration', () => {
    expect(generationSchema.safeParse({ prompt: 'x', duration: 1 }).success).toBe(false);
    expect(generationSchema.safeParse({ prompt: 'x', duration: 11 }).success).toBe(false);
  });
  it('rejects invalid aspect ratio', () => {
    expect(generationSchema.safeParse({ prompt: 'x', duration: 5, aspectRatio: '4:3' }).success).toBe(false);
  });
});
