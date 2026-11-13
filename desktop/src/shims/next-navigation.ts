// next/navigation on the desktop, over react-router.
import { useMemo } from "react";
import { useLocation, useNavigate, useParams as useRouterParams, useSearchParams as useRouterSearch } from "react-router-dom";

export function usePathname() { return useLocation().pathname; }

export function useSearchParams() {
  const [sp] = useRouterSearch();
  return sp as unknown as URLSearchParams & { readonly size: number };
}

export function useParams<T extends Record<string, string> = Record<string, string>>() { return useRouterParams() as T; }

export function useRouter() {
  const nav = useNavigate();
  return useMemo(() => ({
    push: (href: string, _o?: { scroll?: boolean }) => nav(href),
    replace: (href: string, _o?: { scroll?: boolean }) => nav(href, { replace: true }),
    back: () => nav(-1),
    forward: () => nav(1),
    refresh: () => nav(0),
    prefetch: (_href: string) => {},
  }), [nav]);
}

export function redirect(href: string): never { location.assign(href); throw new Error("redirect"); }
export function notFound(): never { throw new Error("not found"); }
