import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger';
  children: ReactNode;
}

const styles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent text-white hover:brightness-110 disabled:opacity-40',
  ghost: 'bg-white/5 text-white hover:bg-white/10 disabled:opacity-40',
  danger: 'bg-transparent text-accent border border-accent/50 hover:bg-accent/10 disabled:opacity-40',
};

export function Button({ variant = 'primary', children, className = '', ...rest }: ButtonProps) {
  return (
    <button
      className={`rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
