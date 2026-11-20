/**
 * The one shared Drizzle client. It connects through Supabase's transaction pooler as the database owner, so
 * row-level security doesn't apply: the role checks in the API routes are the access control (NFR-06). Server only.
 *
 * @author Mahir Al Kamal
 */
import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/models';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
}

// The transaction pooler doesn't support prepared statements.
const client = postgres(url, { prepare: false });

/** The database client every service uses (passed in, so tests can give a fake). */
export const db = drizzle(client, { schema, casing: 'snake_case' });

/** The type of {@link db}, for service parameters. */
export type Database = typeof db;
