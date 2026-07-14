import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdvancedSettings as Settings, GenerationParams, JobPublic } from '../../types/animation';
import { useVideoGeneration } from '../../hooks/useVideoGeneration';
import { useGenerationHistory } from '../../hooks/useGenerationHistory';
import { fetchHealth } from '../../services/animationApi';
import { findTemplate } from '../../utils/motionTemplates';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';
import { ImageUploader } from './ImageUploader';
import { MotionTemplatePicker } from './MotionTemplatePicker';
import { PromptEditor } from './PromptEditor';
import { DurationSlider } from './DurationSlider';
import { AdvancedSettings } from './AdvancedSettings';
import { GenerationProgress } from './GenerationProgress';
import { VideoPreview } from './VideoPreview';
import { GenerationHistory } from './GenerationHistory';
import { ErrorMessage } from './ErrorMessage';

const DEFAULT_SETTINGS: Settings = {
  aspectRatio: '9:16',
  motionStrength: 'medium',
  cameraMotion: 'static',
  loop: false,
};

export function AnimationStudio() {
  const [image, setImage] = useState<File | null>(null);
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(5);
  const [templateId, setTemplateId] = useState<string | undefined>();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [demoMode, setDemoMode] = useState(true);

  const history = useGenerationHistory();
  const onCompleted = useCallback(
    (job: JobPublic) => {
      history.add({
        jobId: job.jobId,
        createdAt: job.createdAt,
        durationSeconds: job.durationSeconds,
        prompt,
        templateId,
        demo: job.demo,
      });
    },
    [history, prompt, templateId],
  );
  const { state, start, cancel, reset } = useVideoGeneration(onCompleted);

  useEffect(() => {
    void fetchHealth().then((h) => setDemoMode(h.demoMode));
  }, []);

  const busy = state.status === 'uploading' || state.status === 'queued' || state.status === 'processing';
  const canGenerate = Boolean(image) && prompt.trim().length > 0 && duration >= 2 && duration <= 10 && !busy;

  const handleGenerate = useCallback(() => {
    if (!image || !canGenerate) return;
    const params: GenerationParams = { prompt, duration, templateId, ...settings };
    void start(image, params);
  }, [image, canGenerate, prompt, duration, templateId, settings, start]);

  const templateLabel = useMemo(() => findTemplate(templateId)?.label, [templateId]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* 左カラム: 入力 */}
      <div className="space-y-4">
        <Panel title="1. キャラクター画像">
          <ImageUploader onSelect={setImage} disabled={busy} />
        </Panel>

        <Panel title="2. 動作テンプレート(選ぶと下の指示に入ります)">
          <MotionTemplatePicker
            selectedId={templateId}
            disabled={busy}
            onPick={(id, p) => {
              setTemplateId(id);
              setPrompt(p);
            }}
          />
        </Panel>

        <Panel title="3. 動きの指示">
          <PromptEditor value={prompt} onChange={setPrompt} disabled={busy} />
        </Panel>

        <Panel title="4. 長さと詳細">
          <DurationSlider value={duration} onChange={setDuration} disabled={busy} />
          <div className="mt-4">
            <AdvancedSettings value={settings} onChange={setSettings} disabled={busy} />
          </div>
        </Panel>

        <Button onClick={handleGenerate} disabled={!canGenerate} className="w-full py-3 text-base">
          {busy ? '生成中…' : 'アニメーションを生成'}
        </Button>
        {!canGenerate && !busy && (
          <p className="text-xs text-muted text-center">画像を選び、動きの指示を入力すると生成できます。</p>
        )}
      </div>

      {/* 右カラム: 結果 */}
      <div className="space-y-4">
        <Panel title="プレビュー">
          {state.status === 'completed' ? (
            <VideoPreview
              jobId={state.jobId}
              videoUrl={state.videoUrl}
              job={state.job}
              prompt={prompt}
              templateLabel={templateLabel}
              onRegenerate={reset}
            />
          ) : state.status === 'failed' ? (
            <ErrorMessage error={state.error} onRetry={handleGenerate} />
          ) : busy ? (
            <GenerationProgress state={state} onCancel={cancel} />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted">
              <p className="text-sm">ここに生成した動画が表示されます。</p>
              {demoMode && (
                <p className="mt-2 text-xs rounded-lg bg-accent2/20 text-accent2 px-2 py-1 font-bold">
                  デモモード:APIキー未設定でもサンプルで動作を確認できます
                </p>
              )}
            </div>
          )}
        </Panel>

        <Panel title="生成履歴">
          <GenerationHistory items={history.items} onRemove={history.remove} onClear={history.clear} />
        </Panel>
      </div>
    </div>
  );
}
