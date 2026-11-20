# Services

Business rules, as plain exported functions: state changes, limits, totals, who may change what. Named
`<entity>Service.ts` in `camelCase`: `billService.ts`, `guestPassService.ts`.

- Pages and API routes never hold business rules; they call a service.
- Each function takes small interfaces it needs (a store, a sender) as a parameter, so tests pass fakes
  (`testFakes.ts`). The real versions, which talk to the database or Supabase, go in
  `src/lib/adapters/<entity>Adapters.ts`, so a service file holds only rules and is fully covered by tests.
- A rule that is broken throws an `AppError` from `src/lib/errors.ts`, with the wording from the SRS.
- Tests sit next to the file (`billService.test.ts`) and cover normal, boundary, invalid input and exception cases.
