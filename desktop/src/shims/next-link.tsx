// next/link on the desktop: react-router's Link for the studio's own pages, the system browser for the web.
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";
import { openExternal } from "../bridge/native";

type Href = string | { pathname?: string; query?: Record<string, string | number | undefined> };
type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: Href; prefetch?: boolean; replace?: boolean; scroll?: boolean; shallow?: boolean; children?: ReactNode;
};

export const hrefString = (h: Href) => {
  if (typeof h === "string") return h;
  const q = Object.entries(h.query ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
  return `${h.pathname ?? ""}${q ? `?${q}` : ""}`;
};

const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, prefetch: _p, replace, scroll: _s, shallow: _sh, target, ...rest }, ref) {
  const to = hrefString(href);
  if (/^(https?:|mailto:)/.test(to) || target === "_blank" || to.startsWith("/api/")) {
    return <a ref={ref} href={to} {...rest} onClick={(e) => { rest.onClick?.(e); if (e.defaultPrevented) return; e.preventDefault(); openExternal(to); }} />;
  }
  return <RouterLink ref={ref} to={to} replace={replace} {...rest} />;
});
export default Link;
