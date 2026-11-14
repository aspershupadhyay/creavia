"use client";
// The last line of defence: an error in the root layout itself. It is reported to Sentry and the page offers a
// reload. It replaces the whole document, so it carries its own minimal styles (docs/DESIGN.md: matte black, marigold).
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0b0b0c",
          color: "#f4f1ea",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ margin: "0 0 20px", opacity: 0.75, lineHeight: 1.5 }}>
            The studio hit an error and has reported it. Try again; if it keeps happening, reload the page.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#f5b335",
              color: "#0b0b0c",
              border: 0,
              borderRadius: 10,
              padding: "10px 18px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
