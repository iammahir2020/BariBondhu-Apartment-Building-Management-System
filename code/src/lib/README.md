# Shared helpers

Code every feature uses, with no business rules of its own:

- `errors.ts`: `AppError` and `toErrorResponse`, so every API route returns errors the same way.
- `roles.ts`: the six roles and their names on screen.
- Coming in the skeleton: the database client (`db.ts`), Supabase clients (`supabase/`), and the role check
  (`permissions.ts`).
