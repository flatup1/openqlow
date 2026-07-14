import { useCallback, useEffect, useRef, useState } from 'react';
import { validateImageFile, formatBytes } from '../../utils/fileValidation';

interface ImageUploaderProps {
  onSelect: (file: File | null) => void;
  disabled?: boolean;
}

export function ImageUploader({ onSelect, disabled }: ImageUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ name: string; size: number; ratio?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const handleFile = useCallback(
    (file: File) => {
      const v = validateImageFile(file);
      if (!v.ok) {
        setError(v.message ?? '画像を読み込めませんでした。');
        onSelect(null);
        return;
      }
      setError(null);
      const url = URL.createObjectURL(file);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
      const img = new Image();
      img.onload = () => {
        const g = gcd(img.naturalWidth, img.naturalHeight);
        setMeta({ name: file.name, size: file.size, ratio: `${img.naturalWidth / g}:${img.naturalHeight / g}` });
      };
      img.src = url;
      setMeta({ name: file.name, size: file.size });
      onSelect(file);
    },
    [onSelect],
  );

  const clear = useCallback(() => {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setMeta(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
    onSelect(null);
  }, [onSelect]);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="画像をアップロード"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !disabled) handleFile(f);
        }}
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
          dragging ? 'border-accent bg-accent/10' : 'border-white/15 hover:border-white/30'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {preview ? (
          <img src={preview} alt="選んだ画像のプレビュー" className="max-h-56 rounded-xl object-contain" />
        ) : (
          <>
            <p className="text-sm font-bold">画像をドラッグ＆ドロップ</p>
            <p className="text-xs text-muted mt-1">またはクリックして選択(PNG・JPG・WEBP / 最大10MB)</p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      {error && (
        <p role="alert" className="mt-2 text-sm text-accent">
          {error}
        </p>
      )}

      {meta && !error && (
        <div className="mt-2 flex items-center justify-between text-xs text-muted">
          <span className="truncate max-w-[60%]">{meta.name}</span>
          <span>
            {formatBytes(meta.size)}
            {meta.ratio ? ` ・ ${meta.ratio}` : ''}
          </span>
          <button type="button" onClick={clear} className="text-accent font-bold ml-2">
            削除
          </button>
        </div>
      )}
    </div>
  );
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
