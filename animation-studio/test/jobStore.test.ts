import { describe, it, expect } from 'vitest';
import { canTransition } from '../server/jobs/videoJobStore';

describe('job state transitions', () => {
  it('allows queued -> processing -> completed', () => {
    expect(canTransition('queued', 'processing')).toBe(true);
    expect(canTransition('processing', 'completed')).toBe(true);
  });
  it('allows failing from queued or processing', () => {
    expect(canTransition('queued', 'failed')).toBe(true);
    expect(canTransition('processing', 'failed')).toBe(true);
  });
  it('forbids leaving terminal states', () => {
    expect(canTransition('completed', 'processing')).toBe(false);
    expect(canTransition('failed', 'processing')).toBe(false);
  });
  it('forbids skipping straight to completed', () => {
    expect(canTransition('queued', 'completed')).toBe(false);
  });
});
