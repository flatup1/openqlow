import { countChars } from '../../utils/promptBuilder';

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  max?: number;
}

const EXAMPLE =
  'ガードから左ジャブ、右ストレート、左フック、右ミドルキックへつなげる。明るく可愛らしく、動きは滑らかに。';

export function PromptEditor({ value, onChange, disabled, max = 2000 }: Props) {
  const count = countChars(value);
  const over = count > max;
  return (
    <div>
      <label htmlFor="prompt" className="block text-sm font-bold mb-2">
        動きの指示(日本語でOK)
      </label>
      <textarea
        id="prompt"
        value={value}
        disabled={disabled}
        maxLength={max + 100}
        rows={4}
        placeholder={EXAMPLE}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl bg-panel2 border border-white/10 p-3 text-sm text-white placeholder:text-muted/60 resize-y disabled:opacity-40"
      />
      <div className="mt-1 flex items-center justify-between text-xs">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(EXAMPLE)}
          className="text-muted hover:text-white disabled:opacity-40"
        >
          例文を入れる
        </button>
        <span className={over ? 'text-accent' : 'text-muted'}>
          {count} / {max}
        </span>
      </div>
    </div>
  );
}
