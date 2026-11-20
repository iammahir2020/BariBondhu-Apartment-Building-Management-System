# BariBondhu: Apartment Building Management System

BariBondhu is a web app for running one apartment building in Dhaka. Residents see and pay their monthly bills,
report faults and pre-approve guests. The building manager runs billing, tickets and staff. Security guards check
guest passes at the gate, maintenance staff work through repair tickets, and the building committee sets charge
rates and approves spending.

Course project for CSE 451 Software Engineering, Autumn 2026, Independent University, Bangladesh (IUB).

## Team

| Member | ID | User class owned |
|---|---|---|
| Mahir Al Kamal | 2632711 | Resident |
| Jannatul Ferdus Nishi | 2231385 | Building Manager |
| Tawhid Moslim | 2311428 | Security Guard |
| Ayesha Siddiqa | 2211155 | Committee Member |
| Adika Rahman | 2221975 | Maintenance Staff |

## Project links

- Task board: [Trello](https://trello.com/b/eChz8VrJ)
- Wiki: see the **Wiki** tab of this repository
- Code quality: [SonarQube Cloud](https://sonarcloud.io/project/overview?id=iammahir2020_BariBondhu-Apartment-Building-Management-System)

## Run the app

The app is in [`code/`](code/). Its [README](code/README.md) is the developer guide: setup, environment
variables, commands, demo accounts, folder layout, how to add a feature, and troubleshooting. In short, with
Node.js 24 and the `.env.local` values from Mahir:

```bash
cd code
npm install
npm run dev
```

## Repository layout

| Path | What it holds |
|---|---|
| `docs/srs/SRS.md` | Software Requirements Specification, v1.5. This is the copy we edit |
| `archive/` folders under `docs/srs/` and `docs/sds/<class>/` | Archived Word versions, not maintained. The `.md` files are the current copies |
| `docs/srs/figures/` | Figures used in the SRS |
| `docs/srs/latex/` | LaTeX source of the SRS for the PDF (`main.tex` and `figures/`), made from `SRS.md`. Compile with XeLaTeX |
| `docs/sds/` | Software Design Specification: `SDS.md` (index and notation), one part per user class with its use case narratives and state diagrams, `system/` for the data flow diagrams, and `design-inputs-from-srs.md` (states, use case links, data flows and entities shared by all parts) |
| `docs/decisions.md` | Technology and design decisions with their reasons |
| `docs/sprint-plan/` | Sprint plan for Release 1: `feature-tickets.md` (every ticket with its owner, dates and dependencies) and `sprint-timeline.html` (the same tickets as a timeline; open it in a browser) |
| `diagrams/` | Diagram sources (`.drawio.svg`), one folder per user class, plus `system/` (data flow diagrams) and `system-administrator/` |
| `docs/ui-prototype/` | Clickable HTML prototype of every screen, in a phone and a web view (`index.html` lists them); the theme in `bb.css` is the one the app uses |
| `code/` | The Next.js app: source in `code/src/`, tests next to the code, migrations in `code/drizzle/`. See [code/README.md](code/README.md) |
| `.github/` | Pull request template and the GitHub Actions check (lint, typecheck, tests, TypeDoc, SonarCloud) |
| `sonar-project.properties` | SonarQube Cloud settings, including which files count toward test coverage |

TypeDoc writes the code's API documentation to `docs/api/` (`npm run docs` in `code/`). It is not committed; anyone
can rebuild it.

## Deliverables

| Due | Deliverable | Status |
|---|---|---|
| 2026-10-15 | SRS with user stories | Done |
| 2026-10-28 | Use case diagrams, use case narratives, state diagrams (4+ objects), DFD Level 0 | Done |
| 2026-11-10 | Language, frameworks, coding standards, documentation tool, architectural pattern | Done |
| 2026-11-28 | Two features per member built (story, UI, code, review, test) | In progress: shared skeleton and feature 1 (log in) built |
| 2026-11-28 | Final report (12 sections) and GitHub Wiki, one page per section. Hard deadline, no extension | Not started |
| 2026-11-29 | Project demonstration and viva | Not started |

## Diagrams

Each diagram is a single `.drawio.svg` file. It shows as a normal image on GitHub and in a browser, and it opens
for editing in [draw.io](https://www.drawio.com/) or the VS Code extension *Draw.io Integration*
(`hediet.vscode-drawio`). Edit the file in place and commit it; git keeps the history, so file names carry no
version numbers.

## How we work

See [CONTRIBUTING.md](CONTRIBUTING.md) for branches, commit messages and pull request reviews.
