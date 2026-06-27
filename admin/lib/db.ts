import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Mirrors web/lib/db/index.ts: a single shared pool against the builder's
// Postgres. Connection is created LAZILY (on first query) rather than at import:
// the /mail route ships a server action that imports this module, and Next
// evaluates that module during the build's page-data collection — where
// DATABASE_URL is not set. An eager `new Pool` / throw there breaks the build.

type Drizzle = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  adminPool?: Pool;
  adminDb?: Drizzle;
};

function getDb(): Drizzle {
  if (globalForDb.adminDb) return globalForDb.adminDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = globalForDb.adminPool ?? new Pool({ connectionString });
  globalForDb.adminPool = pool;

  const instance = drizzle(pool, { schema });
  globalForDb.adminDb = instance;
  return instance;
}

// A thin proxy so call sites keep using `db.select(...)` / `db.insert(...)` /
// `db.query` unchanged, while the real connection is deferred until first access.
export const db = new Proxy({} as Drizzle, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
}) as Drizzle;

export { schema };
