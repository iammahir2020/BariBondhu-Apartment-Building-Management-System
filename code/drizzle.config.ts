/**
 * drizzle-kit settings: where the models are, where migrations go, and the database to migrate. Migrations use the
 * session pooler (`DATABASE_URL_MIGRATE`), because the transaction pooler can't run them.
 *
 * @author Mahir Al Kamal
 */
import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'drizzle-kit';

loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'DATABASE_URL_MIGRATE is not set. Copy .env.example to .env.local and fill it in.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/models/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: { url },
  // Supabase's own schemas (auth, storage) aren't ours to manage.
  schemaFilter: ['public'],
  entities: { roles: { provider: 'supabase' } },
});
