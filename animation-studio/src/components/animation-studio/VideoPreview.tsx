import { useState } from 'react';
import type { JobPublic } from '../../types/animation';
import { downloadUrl } from '../../services/animationApi';
import { buildDownloadFilename, triggerDownload } from '../../utils/download';
import { Button } from '../ui/Button';

interface Props {
  jobId: string;
  videoUrl: string;
  job: JobPublic;
  prompt: string;
  templateLabel?: string;
  onRegenerate: () => void;
}

export function VideoPreview({ jobId, videoUrl, job, prompt, templateLabel, onRegenerate }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(downloadUrl(jobId));
      if (!res.ok) throw new Error('download failed');
      const blob = await res.blob();
      triggerDownload(blob, buildDownloadFilename(job.createdAt));
    } catch {
      setError('保存に失敗しました。もう一度お試しください。');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      {job.demo && (
        <p className="mb-2 inline-block rounded-lg bg-accent2/20 text-accent2 text-xs font-bold px-2 py-1">
          デモモード:サンプル動画を使用しています
        </p>
      )}
      <video
        key={videoUrl}
        src={videoUrl}
        controls
        loop
        playsInline
        className="w-full rounded-2xl bg-black"
        aria-label="生成されたアニメーション動画"
      >
        お使いのブラウザは動画再生に対応していません。
      </video>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
        <div>
          <dt className="inline font-bold">長さ:</dt> <dd className="inline">{job.durationSeconds}秒</dd>
        </div>
        <div>
          <dt className="inline font-bold">形式:</dt> <dd className="inline">MP4</dd>
        </div>
        <div className="col-span-2">
          <dt className="inline font-bold">生成日時:</dt>{' '}
          <dd className="inline">{new Date(job.createdAt).toLocaleString('ja-JP')}</dd>
        </div>
        {templateLabel && (
          <div className="col-span-2">
            <dt className="inline font-bold">テンプレート:</dt> <dd className="inline">{templateLabel}</dd>
          </div>
        )}
        <div className="col-span-2">
          <dt className="inline font-bold">指示:</dt> <dd className="inline">{prompt}</dd>
        </div>
      </dl>

      {error && (
        <p role="alert" className="mt-2 text-sm text-accent">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Button onClick={handleDownload} disabled={downloading}>
          {downloading ? '保存中…' : 'MP4を保存'}
        </Button>
        <Button variant="ghost" onClick={onRegenerate}>
          もう一度生成
        </Button>
      </div>
    </div>
  );
}
