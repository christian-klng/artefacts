import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Mirrors web/lib/db/index.ts: a single shared pool against the builder's
// Postgres. The admin app only ever reads, but uses the same connection string.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const globalForDb = globalThis as unknown as { adminPool?: Pool };
const pool = globalForDb.adminPool ?? new Pool({ connectionString });
if (process.env.NODE_ENV !== "production") globalForDb.adminPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
