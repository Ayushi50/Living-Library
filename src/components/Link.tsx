import type { MouseEvent, ReactNode } from 'react';
import { navigate } from '../lib/ui';

/** In-app link: keeps hash routing and browser history coherent, while still working with middle-click. */
export function Link({ to, children, className, ...rest }: { to: string; children: ReactNode; className?: string; [k: string]: unknown }) {
  const onClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={`#${to}`} className={className} onClick={onClick} {...rest}>{children}</a>;
}
