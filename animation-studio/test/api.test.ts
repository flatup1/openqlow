import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/index';

const app = createApp();
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQBBn8gAAAAASUVORK5CYII=',
  'base64',
);

async function waitForComplete(jobId: string, tries = 30): Promise<string> {
  for (let i = 0; i < tries; i++) {
    const res = await request(app).get(`/api/video-status/${jobId}`);
    if (res.body.status === 'completed') return 'completed';
    if (res.body.status === 'failed') return `failed:${res.body.error?.code}`;
    await new Promise((r) => setTimeout(r, 150));
  }
  return 'timeout';
}

describe('video API (demo mode)', () => {
  it('health reports demo mode', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects generation without image', async () => {
    const res = await request(app).post('/api/generate-video').field('prompt', 'ジャブ').field('duration', '5');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_IMAGE');
  });

  it('rejects out-of-range duration', async () => {
    const res = await request(app)
      .post('/api/generate-video')
      .field('prompt', 'ジャブ')
      .field('duration', '99')
      .attach('image', PNG_1x1, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('generates, reports status and downloads MP4', async () => {
    const gen = await request(app)
      .post('/api/generate-video')
      .field('prompt', 'ガードから左ジャブ')
      .field('duration', '5')
      .attach('image', PNG_1x1, { filename: 'a.png', contentType: 'image/png' });
    expect(gen.status).toBe(202);
    const jobId = gen.body.jobId as string;
    expect(jobId).toBeTruthy();

    const result = await waitForComplete(jobId);
    expect(result).toBe('completed');

    const dl = await request(app).get(`/api/video-download/${jobId}`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toBe('video/mp4');
    expect(dl.headers['content-disposition']).toContain('.mp4');
  });

  it('returns 404 for unknown job', async () => {
    const res = await request(app).get('/api/video-status/does-not-exist');
    expect(res.status).toBe(404);
  });
});
