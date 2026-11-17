# BariBondhu: Apartment Building Management System

BariBondhu is a web app for running one apartment building in Dhaka. Residents see and pay their monthly bills,
report faults and pre-approve guests. The building manager runs billing, tickets and staff. Security guards check
guest passes at the gate, maintenance staff work through repair tickets, and the building committee sets charge
rates and approves spending.

Course project for CSE 451 Software Engineering, Autumn 2026, Independent University, Bangladesh (IUB).

## Team

| Member | User class owned |
|---|---|
| Mahir Al Kamal | Resident |
| Jannatul Ferdus Nishi | Building Manager |
| Tawhid | Security Guard |
| Ayesha Siddiqa | Committee Member |
| Adika Rahman | Maintenance Staff |

## Project links

- Task board: [Trello](https://trello.com/b/eChz8VrJ)
- Wiki: see the **Wiki** tab of this repository

## Repository layout

| Path | What it holds |
|---|---|
| `docs/srs/SRS.md` | Software Requirements Specification, v1.5. This is the copy we edit |
| `archive/` folders under `docs/srs/` and `docs/sds/<class>/` | Archived Word versions, not maintained. The `.md` files are the current copies |
| `docs/srs/figures/` | Figures used in the SRS |
| `docs/srs/latex/` | LaTeX template for the final SRS report |
| `docs/sds/` | Software Design Specification: `SDS.md` (index and notation), one part per user class with its use case narratives and state diagrams, `system/` for the data flow diagrams, and `design-inputs-from-srs.md` (states, use case links, data flows and entities shared by all parts) |
| `docs/decisions.md` | Technology and design decisions with their reasons |
| `diagrams/` | Diagram sources (`.drawio.svg`), one folder per user class, plus `system/` (data flow diagrams) and `system-administrator/` |

Source code and tests come next, built with the stack and pattern in `docs/decisions.md`.

## Deliverables

| Due | Deliverable | Status |
|---|---|---|
| 2026-10-15 | SRS with user stories | Done |
| 2026-10-28 | Use case diagrams, use case narratives, state diagrams (4+ objects), DFD Level 0 | Done |
| 2026-11-10 | Language, frameworks, coding standards, documentation tool, architectural pattern | Done |
| 2026-11-28 | Two features per member built (story, UI, code, review, test) | Not started |
| 2026-11-28 | Final report (12 sections) and GitHub Wiki, one page per section. Hard deadline, no extension | Not started |
| 2026-11-29 | Project demonstration and viva | Not started |

## Diagrams

Each diagram is a single `.drawio.svg` file. It shows as a normal image on GitHub and in a browser, and it opens
for editing in [draw.io](https://www.drawio.com/) or the VS Code extension *Draw.io Integration*
(`hediet.vscode-drawio`). Edit the file in place and commit it; git keeps the history, so file names carry no
version numbers.

## How we work

See [CONTRIBUTING.md](CONTRIBUTING.md) for branches, commit messages and pull request reviews.
