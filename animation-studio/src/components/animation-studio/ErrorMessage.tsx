import type { AppError } from '../../types/animation';
import { Button } from '../ui/Button';

interface Props {
  error: AppError;
  onRetry?: () => void;
}

export function ErrorMessage({ error, onRetry }: Props) {
  return (
    <div role="alert" className="rounded-2xl border border-accent/40 bg-accent/10 p-4">
      <p className="text-sm font-bold text-white">{error.message}</p>
      {error.retryable && onRetry && (
        <Button variant="ghost" className="mt-3" onClick={onRetry}>
          もう一度試す
        </Button>
      )}
    </div>
  );
}
