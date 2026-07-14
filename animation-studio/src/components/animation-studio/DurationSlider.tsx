interface Props {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
}

export function DurationSlider({ value, onChange, disabled, min = 2, max = 10 }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label htmlFor="duration" className="text-sm font-bold">
          動画の長さ
        </label>
        <span className="text-sm font-bold text-accent" aria-live="polite">
          {value}秒
        </span>
      </div>
      <input
        id="duration"
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label="動画の長さ(秒)"
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent disabled:opacity-40"
      />
      <div className="flex justify-between text-xs text-muted mt-1">
        <span>{min}秒</span>
        <span>{max}秒</span>
      </div>
    </div>
  );
}
