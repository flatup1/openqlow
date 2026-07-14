import { motion, useReducedMotion } from 'framer-motion';
import { AnimationStudio } from '../components/animation-studio/AnimationStudio';

export function AnimationStudioPage() {
  const reduce = useReducedMotion();
  return (
    <div className="min-h-screen bg-ink">
      <header className="border-b border-white/5">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h1 className="text-xl sm:text-2xl font-black">
              FLATUP <span className="text-accent">AI Animation Studio</span>
            </h1>
            <p className="text-sm text-muted mt-1">
              1枚の画像から、滑らかなアニメへ。画像・動き・秒数を指定して、SNSやWebサイト用の動画を生成します。
            </p>
          </motion.div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <AnimationStudio />
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted">
        世界一初心者に優しい格闘技ジム FLATUP GYM ／ 怖くない・比べない・置いていかない
      </footer>
    </div>
  );
}
