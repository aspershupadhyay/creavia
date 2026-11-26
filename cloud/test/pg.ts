// The Postgres client the tests give lib/db.ts: plain queries, and transactions on one connection, so the row lock
// (lib/db.ts withRowLock, db/009_row_security.sql) runs in every database test as it does on Neon.
import type pg from "pg";
import type { SqlClient } from "@/lib/db";

export function pgClient(pool: pg.Pool): SqlClient {
  return {
    query: async (text, values) => (await pool.query(text, values as unknown[])).rows,
    transaction: async (qs) => {
      const c = await pool.connect();
      try {
        await c.query("begin");
        const out: unknown[] = [];
        for (const q of qs) out.push((await c.query(q.text, q.values as unknown[])).rows);
        await c.query("commit");
        return out;
      } catch (e) {
        await c.query("rollback").catch(() => null);
        throw e;
      } finally {
        c.release();
      }
    },
  };
}
