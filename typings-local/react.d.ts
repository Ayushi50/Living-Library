// Minimal stand-in for @types/react, used ONLY by tsconfig.local.json in environments where the npm
// registry is unreachable. With `npm install`, the real @types/react is used and this file is ignored.
declare module 'react' {
  export type ReactNode = any;
  export type ReactElement = any;
  export type CSSProperties = Record<string, string | number | undefined> & { [k: `--${string}`]: string | number | undefined };
  export type Dispatch<A> = (v: A) => void;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export type RefObject<T> = { current: T | null };
  export type MutableRefObject<T> = { current: T };
  export type FC<P = {}> = (props: P & { children?: ReactNode }) => ReactNode;
  export type PropsWithChildren<P = {}> = P & { children?: ReactNode };
  export interface SyntheticEvent<T = Element> { currentTarget: T; target: EventTarget & any; preventDefault(): void; stopPropagation(): void; nativeEvent: any; key?: string; }
  export type ChangeEvent<T = Element> = SyntheticEvent<T> & { target: T & any };
  export type FormEvent<T = Element> = SyntheticEvent<T>;
  export type MouseEvent<T = Element> = SyntheticEvent<T> & { clientX: number; clientY: number; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean; button: number };
  export type PointerEvent<T = Element> = MouseEvent<T> & { pointerType: string; pointerId: number };
  export type KeyboardEvent<T = Element> = SyntheticEvent<T> & { key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean };
  export type FocusEvent<T = Element> = SyntheticEvent<T>;
  export type DragEvent<T = Element> = MouseEvent<T> & { dataTransfer: DataTransfer };
  export type Ref<T> = RefObject<T> | ((el: T | null) => void) | null;
  export function useState<S>(init: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useEffect(fn: () => void | (() => void), deps?: readonly any[]): void;
  export function useLayoutEffect(fn: () => void | (() => void), deps?: readonly any[]): void;
  export function useMemo<T>(fn: () => T, deps: readonly any[]): T;
  export function useCallback<T extends (...a: any[]) => any>(fn: T, deps: readonly any[]): T;
  export function useRef<T>(init: T): MutableRefObject<T>;
  export function useRef<T>(init: T | null): RefObject<T>;
  export function useRef<T = undefined>(): MutableRefObject<T | undefined>;
  export function useId(): string;
  export function useReducer<S, A>(r: (s: S, a: A) => S, init: S): [S, Dispatch<A>];
  export function useSyncExternalStore<T>(subscribe: (cb: () => void) => () => void, get: () => T, getServer?: () => T): T;
  export function useDeferredValue<T>(v: T): T;
  export function useTransition(): [boolean, (fn: () => void) => void];
  export function createContext<T>(v: T): { Provider: FC<{ value: T }>; Consumer: any };
  export function useContext<T>(c: { Provider: any }): T;
  export function memo<T>(c: T): T;
  export function forwardRef<T, P = {}>(r: (props: P, ref: Ref<T>) => ReactNode): (props: P & { ref?: Ref<T> }) => ReactNode;
  export const Fragment: any;
  export const StrictMode: any;
  export const Suspense: any;
  export function createElement(...a: any[]): any;
  export function startTransition(fn: () => void): void;
  export function isValidElement(x: any): boolean;
  export interface HTMLProps {
    onClick?: (e: MouseEvent<any>) => void; onDoubleClick?: (e: MouseEvent<any>) => void; onMouseDown?: (e: MouseEvent<any>) => void; onMouseUp?: (e: MouseEvent<any>) => void;
    onMouseEnter?: (e: MouseEvent<any>) => void; onMouseLeave?: (e: MouseEvent<any>) => void; onMouseMove?: (e: MouseEvent<any>) => void;
    onChange?: (e: ChangeEvent<any>) => void; onInput?: (e: FormEvent<any>) => void; onSubmit?: (e: FormEvent<any>) => void;
    onKeyDown?: (e: KeyboardEvent<any>) => void; onKeyUp?: (e: KeyboardEvent<any>) => void;
    onFocus?: (e: FocusEvent<any>) => void; onBlur?: (e: FocusEvent<any>) => void;
    onPointerDown?: (e: PointerEvent<any>) => void; onPointerMove?: (e: PointerEvent<any>) => void; onPointerUp?: (e: PointerEvent<any>) => void;
    onPointerEnter?: (e: PointerEvent<any>) => void; onPointerLeave?: (e: PointerEvent<any>) => void; onPointerCancel?: (e: PointerEvent<any>) => void;
    onScroll?: (e: SyntheticEvent<any>) => void; onLoad?: (e: SyntheticEvent<any>) => void; onError?: (e: SyntheticEvent<any>) => void;
    onDragOver?: (e: DragEvent<any>) => void; onDrop?: (e: DragEvent<any>) => void; onDragEnter?: (e: DragEvent<any>) => void; onDragLeave?: (e: DragEvent<any>) => void;
    onTouchStart?: (e: SyntheticEvent<any>) => void; onWheel?: (e: SyntheticEvent<any>) => void;
    ref?: any; style?: any; [k: string]: any;
  }
  const React: any;
  export default React;
}
declare module 'react/jsx-runtime' {
  export const jsx: any; export const jsxs: any; export const Fragment: any;
}
declare module 'react-dom/client' {
  export function createRoot(el: Element): { render(n: any): void; unmount(): void };
}
declare module 'react-dom' {
  export function createPortal(children: any, container: Element): any;
  export function flushSync(fn: () => void): void;
}
declare namespace JSX {
  interface IntrinsicElements { [tag: string]: import('react').HTMLProps }
  interface IntrinsicAttributes { key?: string | number | null }
  type Element = any;
  interface ElementChildrenAttribute { children: {} }
}
