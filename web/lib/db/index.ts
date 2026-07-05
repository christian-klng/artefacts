import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Reuse the pool across hot-reloads in development to avoid exhausting
// Postgres connections.
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool = globalForDb.pool ?? new Pool({ connectionString });
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
// The raw pool is needed by the per-project data plane (lib/appdb/*), which runs
// hand-built parameterized SQL under SET LOCAL ROLE rather than through Drizzle.
export { schema, pool };

// The transaction handle drizzle hands to a db.transaction(async (tx) => …)
// callback. Exported so helpers that must run inside a caller's transaction
// (e.g. the Stripe webhook handlers) can be typed without re-deriving it.
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
