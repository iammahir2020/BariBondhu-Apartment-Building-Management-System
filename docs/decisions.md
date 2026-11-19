# Technology and design decisions

Decided on 10 November 2026. Updated on 15 November 2026: the database moved from MongoDB Atlas to Supabase
(PostgreSQL) with Drizzle, and login moved from Auth.js to Supabase Auth. Updated on 19 November 2026: Node.js 20
moved to Node.js 24, since Node.js 20 reached end of life on 30 April 2026, and source paths now start with `code/`, the
folder the app lives in.

BariBondhu manages one apartment building for five user classes. Most of what it does is move records through states:
bills, payment claims, fault tickets, guest passes. We are five people with three weeks to build ten features, so we
picked a stack that catches mistakes early and is quick for all of us to learn.

## 1. Programming language

- **Decision:** TypeScript on Node.js 24 LTS. Node.js 20 was the first choice, but it reached end of life on
  30 April 2026 and gets no more security fixes; Node.js 24 is the current LTS and is supported until April 2028.
- **Why:** The same language runs in the browser and on the server, so anyone can work on any part of a feature. Types
  catch wrong field names and missing values before the code runs, which matters when five people's features share
  the same models. A bill's status can be typed as `'Unpaid' | 'Awaiting verification' | 'Paid'`, so the editor rejects
  any state that isn't in our state diagrams. Next.js, shadcn/ui, Drizzle and the Supabase client all ship with
  TypeScript support.
- **Alternatives considered:** Plain JavaScript (nothing new to learn, but mistakes only show up at runtime). Python
  with Django (fast for admin-style apps, but we'd still need a separate frontend).

## 2. Frameworks

- **Decision:**

  | Part | Choice |
  |---|---|
  | Web app (frontend and backend) | Next.js 15, App Router |
  | UI | shadcn/ui with Tailwind CSS |
  | Database | Supabase (PostgreSQL), accessed through the Drizzle ORM |
  | Login and roles | Supabase Auth, one role per user class |
  | Testing | Jest and React Testing Library |
  | Code review | SonarCloud and pull request reviews |
  | Demo hosting | Vercel |

- **Why:**
  - Next.js keeps the pages and the API in one project: one install, one deploy. We use one pattern only. Pages are
    React components that fetch from `/api/...` routes, and we don't use server actions.
  - shadcn/ui is built on Radix, so keyboard use and screen-reader labels work out of the box. All components share one
    theme, which helps with Nielsen's consistency heuristic. The component code sits in our repo and we can edit it.
  - Our data is relational: a flat has occupancies, an occupancy has bills, a bill has lines and payments, a ticket
    has followers and status changes. PostgreSQL keeps these links correct with foreign keys, and a payment and the
    bill it marks Paid can be saved in one transaction. Supabase hosts PostgreSQL on a free plan with no local install,
    and the whole team shares one project.
  - Drizzle defines each table in TypeScript, so the database schema and our types come from the same code. A bill's
    status is a PostgreSQL enum, so the database rejects any state that isn't in our state diagrams, just as the
    editor does. `drizzle-kit` turns schema changes into SQL migration files that we commit and review like any other
    code.
  - Supabase Auth comes with the database, so there is no separate login service to set up. It stores hashed
    passwords, makes reset links and keeps sessions (BR-15, NFR-04). Each user's role is stored in the `profiles` table next to their
    Supabase user, and every API route checks it against the permissions table in `docs/sds/design-inputs-from-srs.md`. Drizzle connects to the database
    directly, which skips Supabase's row-level security, so these route checks are the access control and they are
    unit tested (NFR-06).
  - Supabase Auth signs users in by email, but the SRS gives every account a generated username, and some residents
    have no email (BR-15, NFR-05). So each account is created by the server with Supabase's admin API under an
    internal address made from its username (for example `bb-4k7q2m@users.baribondhu.invalid`), and the log-in screen
    asks only for the username. A real email, when there is one, is stored on the profile. For Forgot password, the
    server asks the admin API for a reset link and sends it to that real email itself. Users without an email get a
    new temporary password from the manager (BM-02).
  - Supabase's built-in email sender only delivers to the project team and is rate-limited, so reset links and
    notifications are sent through our own email service (SMTP), the one the SRS lists in section 2.
  - SonarCloud is free for public repos and scans every pull request on its own.
- **Alternatives considered:** React and Express as two separate apps (more setup). MUI (no Tailwind needed, but harder
  to style with the App Router). MongoDB Atlas with Mongoose (our first choice, but our records are linked to each
  other, and Mongo can't enforce those links). Prisma instead of Drizzle (more beginner guides, but it adds a code
  generation step and its own schema language, while Drizzle is plain TypeScript). Auth.js instead of Supabase Auth (works
  with any database, but we would have to build password resets and email sending ourselves).

## 3. Coding standards

- **Decision:** Next.js's built-in ESLint configs (`next/core-web-vitals` and `next/typescript`) with Prettier and
  TypeScript's `strict` mode, plus a few team conventions.
- **Why:** These ship with Next.js, so they fit our stack with no setup. They catch real bugs, like missing hook
  dependencies, `any` types and inputs without labels (`jsx-a11y` rules), without drowning beginners in style errors.
  Prettier makes everyone's code look the same.
- **Team conventions:**
  - Component files in `PascalCase.tsx` (`BillTable.tsx`), other files in `camelCase.ts` (`billService.ts`).
  - Models and types are singular `PascalCase` (`Bill`, `GuestPass`). API routes are plural nouns (`/api/bills`).
  - No `any`. If a type is unknown, use `unknown` and narrow it.
  - Business rules go in `code/src/services/`, never in pages or routes.
  - Every exported function gets a TSDoc comment (`@param`, `@returns`, `@throws`).
  - Branches are named `<kind>/<first-name>-<short-name>`, in lowercase with hyphens, where kind is `feature`, `docs`
    or `fix` (for example `feature/mahir-guest-pass`). Shared setup work uses `chore/<short-name>`.
  - The same rules, plus commit and pull request steps, are in `CONTRIBUTING.md`.
- **How it is enforced:** VS Code formats on save. A pre-commit hook (husky and lint-staged) runs ESLint and Prettier
  on changed files. `npm run lint` and `npx tsc --noEmit`, run in `code/`, must pass before a pull request is opened. Each pull request
  needs one review from a teammate and is checked by SonarCloud before merging into `main`.
- **Alternatives considered:** The Airbnb style guide (strict for beginners, and its config lags behind ESLint 9).
  StandardJS (clashes with Prettier).

## 4. Source code documentation tool

- **Decision:** TypeDoc.
- **Why:** It is built for TypeScript. It reads the types straight from the code, so comments only need to explain
  what a function does, not repeat its types. `npm run docs` builds an HTML site from the comments.
- **Example:**

  ```ts
  /**
   * Marks a payment claim as verified and the linked bill as Paid.
   * @param claimId - ID of the payment claim.
   * @param managerId - ID of the manager checking it.
   * @returns The updated bill.
   * @throws If the claim was already verified or rejected.
   */
  export async function verifyPaymentClaim(claimId: string, managerId: string): Promise<Bill> { ... }
  ```

- **Where the generated docs live:** `docs/api/`, not committed, since anyone can rebuild it. Screenshots go on the
  wiki. The shadcn code in `code/src/components/ui/` is left out.
- **Alternatives considered:** JSDoc (made for JavaScript; with TypeScript it makes you write each type twice).
  Compodoc (made for Angular).

## 5. Architectural pattern

- **Decision:** MVC with a service layer.
- **Why:** Our records change state. A bill goes Unpaid → Awaiting verification → Paid; a fault ticket goes Reported →
  Assigned → Fixed → Closed. Models hold the records and their states, controllers handle requests, views show the
  result. Next.js already splits pages from API routes, so MVC fits it. Business rules live in services as plain
  functions, which Jest can test without a browser. Every feature touches the same four folders, so the first one
  becomes a template for the rest.
- **How the code is organised:** the Next.js app lives in the `code/` folder, and the documents, diagrams and UI
  prototype stay where they are.

  | Part | Folder | Example |
  |---|---|---|
  | Model | `code/src/models/` (Drizzle tables and their types), migrations in `code/drizzle/` | `Bill.ts` |
  | Service | `code/src/services/` | `billService.ts` |
  | Controller | `code/src/app/api/<resource>/route.ts` | `code/src/app/api/bills/route.ts` |
  | View | `code/src/app/<role>/.../page.tsx`, `code/src/components/` | `code/src/app/resident/bills/page.tsx` |

  A request goes page → `fetch('/api/bills')` → route checks the role → `billService` → `Bill` model, and the JSON
  comes back the same way.
- **Alternatives considered:** ECB matches our use case narratives, and our services do the "control" job. Next.js
  documentation talks in MVC terms, though, so MVC is easier for the team. CQRS is meant for large systems with heavy
  reporting, which one building doesn't need.
