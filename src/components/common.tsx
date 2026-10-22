import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Book, Media } from '../types';
import { spineColor } from '../lib/books';
import { inkOn, shade } from '../lib/color';
import { useData } from '../lib/store';
import { usePrefersReducedMotionMedia } from '../lib/ui';
import { Icon } from './Icon';

/* ---------------------------------------------------------------- motion */

/** Resolves the app's motion preference (system / reduce / full) to a boolean. */
export function useMotion(): boolean {
  const prefs = useData().prefs;
  const system = usePrefersReducedMotionMedia();
  if (prefs.motion === 'reduce') return false;
  if (prefs.motion === 'full') return true;
  return !system;
}

/* ----------------------------------------------------------------- modal */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, size = 'md', footer, label }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; size?: 'sm' | 'md' | 'lg'; footer?: ReactNode; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const prev = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    prev.current = document.activeElement as HTMLElement | null;
    document.body.classList.add('is-locked');
    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE);
      el?.focus();
    }, 30);
    return () => {
      clearTimeout(t);
      document.body.classList.remove('is-locked');
      prev.current?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
    if (e.key === 'Tab' && ref.current) {
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={onKey}>
      <div ref={ref} className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : label}>
        <header className="modal-head">
          {title ? <h2 id={titleId} className="modal-title">{title}</h2> : <span />}
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------------------------------------------------------- inputs */

export function Rating({ value, onChange, size = 20, readOnly }: { value?: number; onChange?: (v: number | undefined) => void; size?: number; readOnly?: boolean }) {
  const v = value ?? 0;
  const set = (n: number) => onChange?.(n === value ? undefined : n);
  const onKey = (e: KeyboardEvent) => {
    if (readOnly) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange?.(Math.min(5, v + 0.5));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange?.(v - 0.5 <= 0 ? undefined : v - 0.5);
    } else if (e.key === 'Backspace' || e.key === 'Delete') onChange?.(undefined);
  };
  return (
    <div className={`rating ${readOnly ? 'is-readonly' : ''}`} role={readOnly ? 'img' : 'slider'} aria-label={readOnly ? `Rated ${v} of 5` : 'Rating'} aria-valuemin={0} aria-valuemax={5} aria-valuenow={v} aria-valuetext={v ? `${v} of 5 stars` : 'Not rated'} tabIndex={readOnly ? -1 : 0} onKeyDown={onKey} style={{ '--star': `${size}px` } as CSSProperties}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, v - (i - 1)));
        return (
          <span key={i} className="star" data-testid={`star-${i}`}>
            <Icon name="star" size={size} className="star-bg" />
            <span className="star-fill" style={{ width: `${fill * 100}%` }}><Icon name="star" size={size} filled /></span>
            {!readOnly && (
              <>
                <button type="button" tabIndex={-1} className="star-hit left" aria-label={`${i - 0.5} stars`} onClick={() => set(i - 0.5)} />
                <button type="button" tabIndex={-1} className="star-hit right" aria-label={`${i} stars`} onClick={() => set(i)} />
              </>
            )}
          </span>
        );
      })}
      {!readOnly && value !== undefined && <button type="button" className="rating-clear" onClick={() => onChange?.(undefined)} aria-label="Clear rating"><Icon name="close" size={12} /></button>}
    </div>
  );
}

export function ProgressBar({ value, label, tone }: { value: number; label?: string; tone?: 'gold' | 'rose' }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`progress ${tone ? `tone-${tone}` : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label ?? 'Progress'}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Field({ label, hint, children, className, error }: { label: string; hint?: string; children: ReactNode; className?: string; error?: string }) {
  const id = useId();
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id} className="field-label">{label}</label>
      {typeof children === 'object' && children && 'type' in (children as object) ? cloneWithId(children, id) : children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
function cloneWithId(node: any, id: string) {
  // Give the first form control the generated id so the <label> is associated with it.
  if (node && node.props && ['input', 'select', 'textarea'].includes(node.type)) return { ...node, props: { ...node.props, id: node.props.id ?? id } };
  return node;
}

export function TagInput({ value, onChange, placeholder, suggestions, label }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[]; label: string }) {
  const [text, setText] = useState('');
  const listId = useId();
  const add = (raw: string) => {
    const parts = raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.some((n) => n.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setText('');
  };
  return (
    <div className="taginput">
      {value.map((t) => (
        <span className="chip chip-removable" key={t}>
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove ${t}`}><Icon name="close" size={12} /></button>
        </span>
      ))}
      <input
        aria-label={label}
        value={text}
        list={suggestions ? listId : undefined}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => (/[,;]/.test(e.target.value) ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => add(text)}
      />
      {suggestions && <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[]; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} title={o.title} className={value === o.value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-mark" aria-hidden="true">{icon ?? '❦'}</div>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- covers */

/** Book cover with a designed fallback. Never shows a broken-image icon. */
export function BookCover({ book, className = '', eager }: { book: Pick<Book, 'title' | 'author' | 'coverUrl' | 'id' | 'spineColor' | 'autoColor'>; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [book.coverUrl]);
  const color = spineColor(book as Book);
  if (book.coverUrl && !failed) {
    return <img className={`cover-img ${className}`} src={book.coverUrl} alt={`Cover of ${book.title}`} loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} onLoad={(e) => { if ((e.currentTarget as HTMLImageElement).naturalWidth < 20) setFailed(true); }} />;
  }
  return <FallbackCover title={book.title} author={book.author} color={color} className={className} />;
}

export function FallbackCover({ title, author, color, className = '' }: { title: string; author?: string; color: string; className?: string }) {
  const style = { '--fc-a': color, '--fc-b': shade(color, -0.35), '--fc-ink': inkOn(color), '--fc-gold': '#d9b866' } as CSSProperties;
  return (
    <div className={`fallback-cover ${className}`} style={style} role="img" aria-label={`Cover of ${title}${author ? ` by ${author}` : ''}`}>
      <div className="fc-frame">
        <span className="fc-orn">❦</span>
        <strong className="fc-title">{title}</strong>
        {author && <span className="fc-author">{author}</span>}
      </div>
    </div>
  );
}

/** Poster with a cinematic fallback. */
export function Poster({ media, className = '' }: { media: Pick<Media, 'title' | 'posterUrl' | 'year' | 'kind'>; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [media.posterUrl]);
  // Hooks must run on every render, so this sits above the early return below.
  const hue = useMemo(() => [...media.title].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 360, 7), [media.title]);
  if (media.posterUrl && !failed) {
    return <img className={`poster-img ${className}`} src={media.posterUrl} alt={`Poster of ${media.title}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  }
  const style = { '--ph': hue } as CSSProperties;
  return (
    <div className={`poster-fallback ${className}`} style={style} role="img" aria-label={`Poster of ${media.title}`}>
      <span className="pf-kind">{media.kind === 'kdrama' ? 'K-Drama' : media.kind === 'anime' ? 'Anime' : media.kind === 'tv' ? 'Series' : 'Film'}</span>
      <strong>{media.title}</strong>
      {media.year ? <span className="pf-year">{media.year}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------- misc hooks */

export function useEscape(handler: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const fn = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && handler();
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [handler, active]);
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
