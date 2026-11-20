# Contributing

## Setup

1. Ask the repository owner to add you as a collaborator, then accept the invitation from your email or GitHub
   notifications.
2. Clone the repository and create your branch from `main`.
3. Install Node.js 24 LTS. The app lives in the `code/` folder, so run every `npm` command from there. Follow
   [code/README.md](code/README.md) to set it up and to see how a feature is built.

## Branches

`main` always holds reviewed work. Nobody pushes to it directly.

Create one branch per Trello card. Put your first name in the branch name, so the branch list shows who did what
(the final report needs screenshots of branches and history as evidence of each member's work):

| Kind of work | Branch name |
|---|---|
| Feature | `feature/<your-name>-<short-name>`, e.g. `feature/mahir-guest-pass` |
| Documents and diagrams | `docs/<your-name>-<short-name>`, e.g. `docs/mahir-resident-state-diagrams` |
| Bug fix | `fix/<your-name>-<short-name>`, e.g. `fix/nishi-bill-total` |

Use lowercase letters and hyphens only. Shared setup work that belongs to nobody in particular (project skeleton,
CI, linters) can use `chore/<short-name>`.

## Code

The reasons behind these rules are in [docs/decisions.md](docs/decisions.md).

- TypeScript in `strict` mode. Don't use `any`; if a type is unknown, use `unknown` and narrow it.
- Component files are `PascalCase.tsx` (`BillTable.tsx`). Other files are `camelCase.ts` (`billService.ts`).
- Models and types are singular `PascalCase` (`Bill`, `GuestPass`). API routes are plural nouns (`/api/bills`).
- Business rules go in `code/src/services/`, never in pages or API routes.
- Every exported function gets a TSDoc comment (`@param`, `@returns`, `@throws`).
- Every page works on a phone and on a laptop. Build it from both prototype views of its screen (`X.html` and
  `X-Web.html`, or `X-Mobile.html` and `X.html` for the manager and admin), phone layout first, and check it at
  360 px wide (no sideways scrolling, tap targets at least 48 px) and at 1280 px (NFR-23).
- Don't edit formatting by hand. Prettier formats on save in VS Code, and the pre-commit hook runs ESLint and Prettier
  on your changed files.
- Run `npm run lint`, `npm run typecheck` and `npm test` in `code/` before opening a pull request. All three must
  pass; the pull request check runs them again.

## Commits

- Write the message in the imperative: "Add guest pass state diagram", not "added diagrams".
- Keep each commit to one change. Commit your own work from your own account, so contributions are traceable.
- Code work: end the message with the ticket ID from `docs/sprint-plan/feature-tickets.md`, e.g.
  "Add ticket tables (BB-1202)".

## Pull requests

1. Push your branch and open a pull request into `main`.
2. Fill in the template, including the link to the Trello card. For code work, start the title with the ticket IDs
   it delivers ("BB-1202, BB-1203: Add ticket tables") and add the PR link to each ticket's Trello card.
3. At least one other member reviews it. The reviewer comments on specific lines and approves or asks for changes.
   SonarCloud also checks every pull request; fix what it flags or explain in a comment why not.
4. The author merges after approval and moves the Trello card to Done.

## Documents and diagrams

- Diagrams are `.drawio.svg` files under `diagrams/<user-class>/`, in `use_case/` or `state_diagrams/`. Edit them in
  draw.io and save in place. Old versions and other formats (PNG, PDF, plain `.drawio`) go in `archive/`.
- Keep diagrams consistent with the SRS: same story IDs, state names and business rules.
