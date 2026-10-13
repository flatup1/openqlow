import type { ReactNode } from 'react';
import { NoScriptLight } from '../lib/NoScriptLight';

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}<NoScriptLight /></>;
}
