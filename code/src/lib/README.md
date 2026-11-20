# Shared helpers

Code every feature uses, with no business rules of its own:

- `errors.ts`: `AppError` and `toErrorResponse`, so every API route returns errors the same way.
- `roles.ts`: the six roles and their names on screen.
- `db.ts`: the one Drizzle client (server only). Services take it as a parameter.
- `supabase/`: `server.ts` (session cookies, for routes) and `admin.ts` (service-role key, server only).
- `env.ts`: `requireEnv`, which names the missing variable.
- `parse.ts`: `readJsonObject` and `requireString` for reading request bodies in routes.
- `apiClient.ts`: `callApi`, how pages call the API and read its errors.
- `adapters/`: the database and Supabase versions of the interfaces services take (`databaseProfileFinder`,
  `supabaseSessionAuth` ...), one file per service. Routes pass them in. Left out of the coverage count.
- `session.ts`: the app's own session cookie (last activity, for the idle limits).
- `permissions.ts`: the role permissions table as `PERMISSIONS`, plus `checkRole`, `requireOwnOccupancy` and
  `requireOwnTicket` (pure, so tests need no database).
- `auth.ts`: `requireRole(request, action)`, the first line of every API route; `requirePageRole(role)` in the role
  layouts; `requireCurrentProfile` for routes any signed-in user may call.
