# Shared helpers

Code every feature uses, with no business rules of its own:

- `errors.ts`: `AppError` and `toErrorResponse`, so every API route returns errors the same way.
- `roles.ts`: the six roles and their names on screen.
- `db.ts`: the one Drizzle client (server only). Services take it as a parameter.
- `supabase/`: `server.ts` (session cookies, for routes) and `admin.ts` (service-role key, server only).
- `env.ts`: `requireEnv`, which names the missing variable.
- `parse.ts`: `readJsonObject` and `requireString` for reading request bodies in routes.
- `apiClient.ts`: `callApi`, how pages call the API and read its errors.
- `session.ts`: the app's own session cookie (last activity, for the idle limits).
- Coming in the skeleton: the role check (`permissions.ts`).
