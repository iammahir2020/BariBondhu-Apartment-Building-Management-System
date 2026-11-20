# Models

Drizzle table definitions and the TypeScript types that come from them. One file per table, named in singular
`PascalCase`: `Bill.ts`, `GuestPass.ts`.

- States are PostgreSQL enums (`pgEnum`) with the exact names from the state diagrams in
  `docs/sds/design-inputs-from-srs.md`, plus the matching TypeScript union exported from the same file.
- Every link between records is a foreign key.
- After changing a model, run `npm run db:generate`, read the SQL it writes to `drizzle/`, and commit both.

No business rules here: those go in `src/services/`.
