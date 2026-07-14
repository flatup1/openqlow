import { useState } from 'react';
import type { AdvancedSettings as Settings, AspectRatio, CameraMotion, MotionStrength } from '../../types/animation';

interface Props {
  value: Settings;
  onChange: (v: Settings) => void;
  disabled?: boolean;
}

const ASPECTS: { id: AspectRatio; label: string }[] = [
  { id: '1:1', label: '1:1 Instagram投稿' },
  { id: '9:16', label: '9:16 リール・Shorts' },
  { id: '16:9', label: '16:9 YouTube・Web' },
];
const CAMERAS: { id: CameraMotion; label: string }[] = [
  { id: 'static', label: '固定' },
  { id: 'push-in', label: 'ゆっくり前進' },
  { id: 'pull-out', label: 'ゆっくり後退' },
  { id: 'pan', label: '左右移動' },
  { id: 'orbit', label: '少し回り込む' },
];
const STRENGTHS: { id: MotionStrength; label: string }[] = [
  { id: 'low', label: '控えめ' },
  { id: 'medium', label: '標準' },
  { id: 'high', label: 'ダイナミック' },
];

export function AdvancedSettings({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-bold text-muted hover:text-white"
      >
        詳細設定 {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          <Field label="アスペクト比">
            <Select
              value={value.aspectRatio}
              disabled={disabled}
              options={ASPECTS}
              onChange={(v) => onChange({ ...value, aspectRatio: v })}
            />
          </Field>
          <Field label="カメラワーク">
            <Select
              value={value.cameraMotion}
              disabled={disabled}
              options={CAMERAS}
              onChange={(v) => onChange({ ...value, cameraMotion: v })}
            />
          </Field>
          <Field label="動きの強さ">
            <Select
              value={value.motionStrength}
              disabled={disabled}
              options={STRENGTHS}
              onChange={(v) => onChange({ ...value, motionStrength: v })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.loop}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, loop: e.target.checked })}
              className="accent-accent"
            />
            ループ再生向けに整える
          </label>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-xs text-muted mb-1">{label}</span>
      {children}
    </div>
  );
}

function Select<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full rounded-xl bg-panel2 border border-white/10 p-2.5 text-sm text-white disabled:opacity-40"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
