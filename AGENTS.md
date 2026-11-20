# AGENTS.md: how to work on BariBondhu

Instructions for AI coding agents (Claude, ChatGPT, Codex, Copilot, Cursor ...) and for the team members using them.
It is self-contained: an agent that can't see the repository can still follow it if you paste it into the chat,
together with the files of the feature you are working on.

If anything here disagrees with the code, the code wins; tell the team so this file gets fixed.

## 1. The project

BariBondhu is a web app for running one apartment building in Dhaka, built by five students for CSE 451 Software
Engineering (IUB, Autumn 2026). It has six roles: **resident**, **security guard** (`guard`), **building manager**
(`manager`), **committee member** (`committee`), **maintenance staff** (`maintenance`) and **system administrator**
(`admin`). Most of the app moves records through states: bills, payment claims, fault tickets, guest passes,
expenses.

Where the requirements live. Read them before writing code; they win over anything general.

| File | What it settles |
|---|---|
| `docs/srs/SRS.md` | User stories (IDs `RES-`, `SG-`, `BM-`, `CM-`, `MNT-`, `ADM-`) with Given/When/Then criteria, business rules (`BR-`), NFRs, **the exact error wording** |
| `docs/sds/design-inputs-from-srs.md` | State diagrams (state names, word for word), main entities, **the role permissions table** |
| `docs/sds/<role>/` | Use case narratives per user class |
| `docs/ui-prototype/` | Every screen as HTML, in a phone and a web view; the theme `bb.css` |
| `docs/decisions.md` | Stack, coding standards, documentation tool, architecture, with reasons |
| `CONTRIBUTING.md` | Branches, commits, pull requests |
| `code/README.md` | The developer guide: setup, environment variables, commands, demo accounts, troubleshooting |
| `docs/sprint-plan/feature-tickets.md` | The team's tickets (`BB-FFNN`), owners, dates and dependencies |

## 2. Rules that are never broken

1. **No `any`.** Unknown data is `unknown` and gets narrowed. ESLint fails on `any`.
2. **Business rules live only in `code/src/services/`.** Never in pages, components or API routes.
3. **Every API route calls `requireRole(request, action)` first.** "Own" rows also call `requireOwnOccupancy` or
   `requireOwnTicket` after loading the record.
4. **Pages call API routes with `fetch` (through `callApi`). No server actions.** Pages never import the database,
   Supabase clients, `auth.ts` or adapters.
5. **State names, story IDs, rule IDs and error messages are copied exactly from the SRS and SDS.** Never invent a
   state or a transition. If the story, the state diagram and the permissions table disagree, stop and ask.
6. **Tests are written with the code, in the same PR**, and cover normal, boundary, invalid input and exception
   cases.
7. **Every file starts with a header comment with `@author <full name>`; every export has a TSDoc comment.**
   `npm run docs` fails otherwise.
8. **Every page works at 360 px and 1280 px**, built from both prototype views.
9. **Secrets only in `code/.env.local`.** Never commit keys, passwords or real emails. The repository is public.
10. **Don't touch `code/src/components/ui/`** (generated shadcn components) unless a change is unavoidable.
11. **Don't commit or push unless the person you work for asks.** Never push to `main`; never rewrite shared history.

## 3. Stack

| Part | Choice |
|---|---|
| Language and runtime | TypeScript, `strict` plus `noUncheckedIndexedAccess`, on Node.js 24 LTS |
| Web app | Next.js 15, App Router, `src/` directory, import alias `@/*` |
| UI | shadcn/ui (Radix) with Tailwind CSS 4, themed from `docs/ui-prototype/bb.css`; icons from `lucide-react` |
| Database | Supabase PostgreSQL through Drizzle ORM (`drizzle-orm`, `postgres`), migrations by `drizzle-kit` |
| Log-in | Supabase Auth; accounts made by the server under `<username>@users.baribondhu.invalid` |
| Email | Our own SMTP (Gmail) through nodemailer, for reset links only |
| Tests | Jest 30, React Testing Library, `@testing-library/user-event` |
| Quality | ESLint (`next/core-web-vitals`, `next/typescript`), Prettier, TypeDoc, SonarCloud, GitHub Actions |

Do not add libraries without asking the team. In particular no SWR, React Query, Redux, Zod or ORMs other than
Drizzle unless the team agrees.

## 4. Where things are

The app lives in `code/`; run every command from there.

```text
code/
├── drizzle/                     migrations (generated SQL, committed) and drizzle/meta/
├── scripts/seed.ts              demo data (npm run db:seed)
├── src/
│   ├── models/                  Model: one Drizzle table per file, singular PascalCase (Bill.ts); all exported from index.ts
│   ├── services/                business rules as plain functions + their tests (billService.ts, billService.test.ts)
│   │   └── testFakes.ts         shared fakes: makeProfile, MemoryAttemptStore, memoryAudit
│   ├── app/
│   │   ├── api/<resource>/route.ts   Controller: one folder per resource, plural (api/bills)
│   │   ├── <role>/...               View: pages per role (resident, guard, manager, committee, maintenance, admin)
│   │   ├── <role>/layout.tsx        wraps pages in AppShell and blocks other roles (requirePageRole)
│   │   └── login, set-password, forgot-password, reset-password   signed-out pages
│   ├── components/              shared components (PascalCase.tsx); ui/ is shadcn; feature parts in components/<feature>/
│   ├── lib/
│   │   ├── adapters/            database and Supabase versions of what services need (<entity>Adapters.ts)
│   │   ├── auth.ts              requireRole, requirePageRole, requireCurrentProfile (server only)
│   │   ├── permissions.ts       the role permissions table (PERMISSIONS) and pure checks
│   │   ├── errors.ts            AppError and toErrorResponse
│   │   ├── parse.ts             readJsonObject, requireString for request bodies
│   │   ├── apiClient.ts         callApi for pages
│   │   ├── navigation.ts        menu links per role (NAV_SECTIONS)
│   │   ├── roles.ts             the six roles and their names on screen
│   │   ├── db.ts                the one Drizzle client (server only)
│   │   └── supabase/            server.ts (session cookies), admin.ts (service role, server only)
│   └── middleware.ts            session refresh, idle time-out, redirects
├── jest.config.mjs              tests and the coverage list
└── typedoc.json                 API docs settings
```

File names: components `PascalCase.tsx`; everything else `camelCase.ts`; models and types singular `PascalCase`;
API routes plural nouns (`/api/bills`). No route groups: folders match URLs.

## 5. How a request flows

```text
page.tsx ──callApi('/api/bills')──▶ route.ts ──▶ requireRole() ──▶ billService.ts ──▶ adapter ──▶ database
                                                                        ▲
                                                           tests pass fakes here instead
```

### Service (business rules)

A service function takes **small interfaces** for what it needs (a store, a notifier, an audit writer), never the
Drizzle client, so tests pass fakes. It throws `AppError` with the SRS wording when a rule is broken.

```ts
/**
 * Business rules for guest passes: create, cancel and list a household's passes (RES-03, BR-11).
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';

/** Reads and writes guest passes. */
export interface GuestPassStore {
  /** Saves a new pass and returns it as stored. */
  insert(pass: NewGuestPass): Promise<GuestPass>;
}

/**
 * Creates a guest pass for the signed-in household.
 * @param deps - Pass store and audit writer.
 * @param input - Guest name, number of guests, start and end.
 * @returns The new pass with its 6-digit code.
 * @throws AppError 400 "Check the visit times" if the end is not after the start or more than 24 hours later.
 */
export async function createGuestPass(deps: { passes: GuestPassStore; audit: AuditWriter }, input: PassInput) {
  if (input.end <= input.start || input.end.getTime() - input.start.getTime() > 24 * 60 * 60 * 1000) {
    throw new AppError('BAD_REQUEST', 'Check the visit times');
  }
  // ...
}
```

- A transition the state diagram doesn't allow throws `AppError('CONFLICT', ...)` (409); bad input is `BAD_REQUEST`
  (400). Codes and statuses are in `code/src/lib/errors.ts`.
- Every change to accounts, occupancies, bills, payments, claims, rates, expenses, tickets, passes and gate records
  writes an audit entry through the `AuditWriter` the service takes (NFR-27). Never put passwords in it.
- In-app notifications go through a shared `Notifier` interface, never straight to the database. It arrives with
  ticket BB-2301 (Adika); until then, take a `Notifier`-shaped parameter and pass a do-nothing fake.

### Adapter (connection code)

`code/src/lib/adapters/<entity>Adapters.ts` holds the Drizzle or Supabase version of each interface. No business
rules here; it is left out of the coverage count. Example: `databaseProfileFinder(db)` in `authAdapters.ts`.

### API route (controller)

Every handler has this shape and nothing else. `code/src/app/api/me/route.ts` is the smallest real example.

```ts
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireRole(request, 'recordPaymentClaim'); // always the first line
    const body = await readJsonObject(request);                    // check and narrow the input
    const billId = requireString(body, 'billId', 'bill');
    const bill = await findBill(billStore(db), billId);
    requireOwnOccupancy(user, bill.occupancyId);                   // only for "Own" rows
    const claim = await recordPaymentClaim(claimDeps(db), user.actor, bill, body);
    return Response.json(claim, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);                                 // the one shared error shape
  }
}
```

- `requireRole` returns `{ actor, scope }`. It answers 401 when nobody is signed in and 403 when the role may not do
  the action or the user still has a temporary password.
- The action name must exist in `PERMISSIONS` in `code/src/lib/permissions.ts`. If it doesn't, add the row there and
  in the permissions table in `docs/sds/design-inputs-from-srs.md`, and add it to `permissions.test.ts`.
- "Own" means a resident reaches only their own occupancy's records (`requireOwnOccupancy(user, record.occupancyId)`,
  BR-09, NFR-13) and maintenance staff only tickets assigned to them (`requireOwnTicket(user, ticket.assigneeId)`).
- Errors always come back as `{ "error": { "code", "message", "details"? } }` from `toErrorResponse`.

### Page (view)

```tsx
'use client';
import { callApi } from '@/lib/apiClient';

const result = await callApi<{ id: string }>('/api/guest-passes', 'POST', input);
if (!result.ok) setError(result.error.message); // show the API's own message
```

- Pages live in `code/src/app/<role>/...`. The role's `layout.tsx` already adds the app shell and refuses other
  roles; don't repeat either in the page.
- Add the page's link to that role's `NAV_SECTIONS` in `code/src/lib/navigation.ts`. Mark it `onPhone` only if it is
  one of the role's main phone tabs; the rest appear under More (`/<role>/more`).

## 6. Building a feature, step by step

Work in this order. Each step is usually one ticket in `docs/sprint-plan/feature-tickets.md`.

### Step 0. Read before coding

1. Find the story in `docs/srs/SRS.md`: its ID, confirmation criteria, the BR- and NFR- items it cites, and the
   exact error messages.
2. Find the object's state machine in `docs/sds/design-inputs-from-srs.md` ("State diagrams") and the use case in
   `docs/sds/<role>/`. State names and transitions come from there, word for word.
3. Find the rows for the action in the "Role permissions" table: which roles, and whether it is "Own".
4. Find the screen in `docs/ui-prototype/`: `X.html` and `X-Web.html` for resident, guard, committee and maintenance
   screens; `X-Mobile.html` and `X.html` for the manager and the administrator.
5. If the story, the state diagram and the permissions table disagree, stop and ask. Don't pick one quietly.
6. Check the branch: `feature/<first-name>-<short-name>` from `main`.
7. Turn the confirmation criteria into a list of test cases.

### Step 1. Model and migration

- One file per table in `code/src/models/`, singular `PascalCase` (`Bill.ts`), exported from `models/index.ts`.
- States are a `pgEnum` with the exact names from the state diagram, plus the matching TypeScript union from the
  same file: `export type BillStatus = (typeof billStatus.enumValues)[number]`.
- A foreign key for every link. Money as whole poisha (integer) or `numeric`, never a float. Columns are camelCase
  in TypeScript; the config turns them into snake_case in SQL.
- Turn on row-level security for every new table with `.enableRLS()` (no policies: Drizzle connects as the owner,
  and the route checks are the access control).
- Make the migration as in [section 7](#7-database-changes-on-the-shared-database).
- If other members wait for your table (a ★ ticket), merge it with a few seed rows as its own small PR first.

### Step 2. Service and its tests

- `code/src/services/<entity>Service.ts` and `<entity>Service.test.ts`, written together.
- All rules here: state changes, limits, totals, who may change what beyond the role.
- Plain exported functions that take small interfaces as parameters (see section 5).
- Name each test after the rule: `it('refuses a claim on a bill that is already Paid (BR-04)')`.
- Cover, for every function: **normal** (the main success path), **boundary** (the edges the SRS names: 7/8/9
  characters, the 5th and 6th try, 24 hours, ৳0), **invalid input** (missing, wrong type, out of range) and
  **exception** (wrong state, not found, already done, a dependency failing).
- Reuse the fakes in `code/src/services/testFakes.ts`; add new shared fakes there.

### Step 3. Adapter

- Add the Drizzle or Supabase version of each interface the service takes in
  `code/src/lib/adapters/<entity>Adapters.ts`.

### Step 4. API route

- `code/src/app/api/<plural-resource>/route.ts`, in the shape shown in section 5.
- Add a test that every role outside the permissions row gets 403 and a signed-out request gets 401 (NFR-06); the
  table-driven tests in `code/src/lib/permissions.test.ts` show the pattern.

### Step 5. Page

- Under `code/src/app/<role>/...`, built from both prototype views of the screen, **mobile first**: plain Tailwind
  classes for the phone, `lg:` (1024 px and up) for the laptop layout.
- Use the components in `code/src/components/ui/`; put feature-specific pieces in
  `code/src/components/<feature>/` as `PascalCase.tsx`.
- Tables become one card per row on phones (column name on the left, value on the right), like the `-Mobile`
  prototype screens; a normal table from `lg:`.
- A label on every input, visible error text from the API, 48 px tap targets, no sideways scrolling at 360 px,
  readable at 150 % text size, works at 1280 px (NFR-23).
- Add a React Testing Library test for the key behaviour (an error shown, a button disabled, a form blocking bad
  input). See `code/src/components/auth/LoginForm.test.tsx`.

### Step 6. Documentation on every new file

```ts
/**
 * Business rules for payment claims: record a cash or bank claim, accept it, reject it with a reason
 * (RES-04, BM-04, BR-04).
 *
 * @author <full name of the member who owns the feature>
 */
```

TSDoc on every exported function, type, interface and constant, including interface methods. Explain what and why;
don't repeat the types (TypeDoc reads them from the code).

```ts
/**
 * Marks a payment claim as accepted and the linked bill as Paid, in one transaction.
 * @param deps - Claim store and audit writer.
 * @param claimId - ID of the payment claim.
 * @returns The updated bill.
 * @throws AppError 409 if the claim was already accepted or rejected.
 */
```

### Step 7. Before saying it's done

Run from `code/` and report the real output:

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes, and the new tests cover normal, boundary, invalid and exception cases
- [ ] `npm run docs` passes (no export without TSDoc)
- [ ] No `any`; unknown data is `unknown` and narrowed
- [ ] Business rules only in `code/src/services/`; the route only checks, parses, calls and responds
- [ ] `requireRole` is the first call in every new handler; "Own" rows also check ownership
- [ ] Every new file has the header with `@author`; every export has TSDoc
- [ ] State names, story IDs, rule IDs and error wording match the SRS and SDS
- [ ] Pages work at 360 px and 1280 px
- [ ] Migration generated, its SQL read, model and migration committed together
- [ ] PR opened with the template, ticket IDs in the title, Trello card links in the body

## 7. Database changes on the shared database

The whole team shares **one** Supabase database, so a migration you apply changes it for everyone.

1. Pull the latest `main` into your branch first, so your migration is numbered after everyone else's.
2. Change or add the model in `code/src/models/` and export it from `index.ts`.
3. `npm run db:generate -- --name <what-changed>` writes `drizzle/00NN_<what-changed>.sql`. Read the SQL.
4. `npm run db:migrate` applies it. Tell the team on Discord which migration you applied.
5. Commit the model, the `.sql` file and the `drizzle/meta/` changes together.

- Never edit or delete a migration that has been applied; write a new one. Never use `drizzle-kit push`.
- Anything drizzle-kit can't write (a trigger, for example) goes in a custom migration:
  `npx drizzle-kit generate --custom --name <name>`, like `0001_audit_log_append_only.sql`.
- Two branches that both add migration `00NN` clash in `drizzle/meta/_journal.json`: the second to merge deletes its
  migration files, pulls `main` and generates again.
- The audit log refuses updates and deletes (a database trigger). Add rows only.
- Demo data comes from `npm run db:seed` (`code/scripts/seed.ts`); it is safe to run again. Scripts make their own
  Drizzle and Supabase clients, because `server-only` modules can't be imported outside Next.js.

## 8. Tests and coverage

- Tests sit next to the code as `*.test.ts` or `*.test.tsx`. Run with `npm test`; coverage with
  `npm run test:coverage`.
- Service tests run in Node with fakes, never the real database.
- Component tests start with `/** @jest-environment jsdom */`. jsdom has no `fetch` or `Response`: use
  `answerFetch(status, body)` or `failFetch()` from `code/src/components/auth/testFetch.ts`, and mock
  `next/navigation` as `LoginForm.test.tsx` does.
- SonarCloud fails a PR when less than 80 % of new code is covered. Connection code, models, pages, layouts, API
  routes and the middleware are left out of that count, so the 80 % applies to services, `lib` helpers and
  components with logic. **The list of left-out files is in two places that must match:** `collectCoverageFrom` in
  `code/jest.config.mjs` and `sonar.coverage.exclusions` in `sonar-project.properties`. Never put business code in an
  excluded file.

## 9. Git, tickets and pull requests

- **Branches:** one per feature, `feature/<first-name>-<short-name>` (`docs/...`, `fix/...` for other work), from
  `main`, lowercase with hyphens. A ★ table ticket gets its own short branch (`feature/mahir-ticket-tables`).
- **Ticket IDs** are `BB-FFNN`: `FF` the feature number, `NN` the step (`BB-1205` = feature 12, step 5); `00` is
  shared setup, `23` is notifications. Each ticket is one Trello card.
- **Commits:** one change each, short imperative message, ticket ID at the end: `Add ticket tables (BB-1202)`.
  The pre-commit hook runs ESLint and Prettier on staged files; don't skip it.
- **PRs:** into `main`, with the template filled in; the title starts with the ticket IDs it delivers
  (`BB-1202, BB-1203: Add ticket tables`); the body links the Trello cards. Keep the description short.
- **Checks on every PR:** GitHub Actions runs `npm ci`, lint, typecheck, tests with coverage, TypeDoc and the
  SonarCloud scan. Fix SonarCloud findings or explain in a PR comment why one stays.
- **Review:** a teammate (the downstream owner) approves before merging. Don't delete branches after merging.

## 10. Known pitfalls

| Symptom | Cause and fix |
|---|---|
| `This module cannot be imported from a Client Component` | A page imported `db.ts`, `auth.ts`, an adapter or a Supabase client. Call an API route instead. |
| A Supabase admin call fails with `Invalid path specified in request URL` | `NEXT_PUBLIC_SUPABASE_URL` must be only `https://<id>.supabase.co`. |
| `X is not set. Copy .env.example to .env.local` | A variable is missing in `code/.env.local`; restart the dev server after editing it. |
| A prepared-statement error from the database | The app uses the transaction pooler with `prepare: false` (`DATABASE_URL`); migrations use `DATABASE_URL_MIGRATE`. |
| `fetch is not defined` in a component test | Use `answerFetch` from `testFetch.ts`. |
| `npm run docs` fails with "does not have any documentation" | Add TSDoc to the export it names, including interface methods. |
| Coverage drops to 0 % for a file in SonarCloud | The file isn't in Jest's coverage list; either test it or add it to both exclusion lists. |
| A Tailwind class has no effect | Tailwind skips git-ignored files; use the class in a tracked file. |
| Locked out after wrong passwords while testing | Wait 15 minutes or delete your row in `login_attempts`; `npm run db:seed` resets demo accounts. |
| Windows: port 3000 still busy | A `node` process is left over; find it with `Get-NetTCPConnection -LocalPort 3000` and stop it. |

## 11. Working style for agents

- **Think first.** Read the story and its state diagram before coding. If a rule is ambiguous, ask instead of
  guessing.
- **Keep it simple.** Build what the story needs: no extra options, abstractions or "for later" code.
- **Surgical changes.** Touch only what the ticket needs. Don't reformat or rename unrelated code; Prettier handles
  formatting (print width 100, 2 spaces, single quotes, trailing commas, semicolons).
- **Check against the goal.** A ticket is done when its behaviour works and the checks in step 7 pass, not when the
  code compiles.
- **Report honestly.** Say which checks you ran and paste their real result; say what you couldn't check.
