// Fills the gap in next@16's dist structure — dist/client/components/navigation
// is not present in this build, so useParams / useRouter / useSearchParams are
// not re-exported from next/navigation. This augmentation restores them.

import type { ReadonlyURLSearchParams } from 'next/navigation';

declare module 'next/navigation' {
  interface NavigateOptions {
    scroll?: boolean;
  }

  interface AppRouterInstance {
    back(): void;
    forward(): void;
    refresh(): void;
    push(href: string, options?: NavigateOptions): void;
    replace(href: string, options?: NavigateOptions): void;
    prefetch(href: string): void;
  }

  export function useRouter(): AppRouterInstance;
  export function useParams<
    T extends Record<string, string | string[]> = Record<string, string | string[]>
  >(): T;
  export function useSearchParams(): ReadonlyURLSearchParams | null;
  export function usePathname(): string;
}
