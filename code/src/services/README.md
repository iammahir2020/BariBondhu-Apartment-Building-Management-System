# Services

Business rules, as plain exported functions: state changes, limits, totals, who may change what. Named
`<entity>Service.ts` in `camelCase`: `billService.ts`, `guestPassService.ts`.

- Pages and API routes never hold business rules; they call a service.
- Each function takes the database (or a small repository object) as a parameter, so tests can pass a fake.
- A rule that is broken throws an `AppError` from `src/lib/errors.ts`, with the wording from the SRS.
- Tests sit next to the file (`billService.test.ts`) and cover normal, boundary, invalid input and exception cases.
