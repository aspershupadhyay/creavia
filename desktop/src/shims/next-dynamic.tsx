// next/dynamic on the desktop: React.lazy with an optional loading view.
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

type Loader<P> = () => Promise<ComponentType<P> | { default: ComponentType<P> }>;
export default function dynamic<P extends object>(load: Loader<P>, opts?: { loading?: () => ReactNode; ssr?: boolean }) {
  const Lazy = lazy(async () => {
    const m = await load();
    return { default: (typeof m === "function" ? m : (m as { default: ComponentType<P> }).default) as ComponentType<P> };
  });
  return function Dynamic(props: P) {
    return <Suspense fallback={opts?.loading?.() ?? null}><Lazy {...props} /></Suspense>;
  };
}
