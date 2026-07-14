import { MOTION_TEMPLATES } from '../../utils/motionTemplates';

interface Props {
  selectedId?: string;
  onPick: (id: string, prompt: string) => void;
  disabled?: boolean;
}

export function MotionTemplatePicker({ selectedId, onPick, disabled }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="動作テンプレート">
      {MOTION_TEMPLATES.map((t) => {
        const active = t.id === selectedId;
        return (
          <button
            key={t.id}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onPick(t.id, t.prompt)}
            className={`rounded-xl px-3 py-2 text-xs font-bold text-left transition disabled:opacity-40 ${
              active ? 'bg-accent text-white' : 'bg-white/5 text-white hover:bg-white/10'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
