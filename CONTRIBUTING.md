# Contributing

## Setup

1. Ask the repository owner to add you as a collaborator, then accept the invitation from your email or GitHub
   notifications.
2. Clone the repository and create your branch from `main`.

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
- Business rules go in `src/services/`, never in pages or API routes.
- Every exported function gets a TSDoc comment (`@param`, `@returns`, `@throws`).
- Don't edit formatting by hand. Prettier formats on save in VS Code, and the pre-commit hook runs ESLint and Prettier
  on your changed files.
- Run `npm run lint` and `npx tsc --noEmit` before opening a pull request. Both must pass.

## Commits

- Write the message in the imperative: "Add guest pass state diagram", not "added diagrams".
- Keep each commit to one change. Commit your own work from your own account, so contributions are traceable.

## Pull requests

1. Push your branch and open a pull request into `main`.
2. Fill in the template, including the link to the Trello card.
3. At least one other member reviews it. The reviewer comments on specific lines and approves or asks for changes.
   SonarCloud also checks every pull request; fix what it flags or explain in a comment why not.
4. The author merges after approval and moves the Trello card to Done.

## Documents and diagrams

- Diagrams are `.drawio.svg` files under `diagrams/<user-class>/`. Edit them in draw.io and save in place.
- Keep diagrams consistent with the SRS: same story IDs, state names and business rules.
