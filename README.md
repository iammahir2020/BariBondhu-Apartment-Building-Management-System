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

## Features

Release 1 builds 15 of the 22 features in the SRS, three per member, each in the member's own user class (agreed
20 Nov 2026).

| Member | Features |
|---|---|
| Mahir Al Kamal | 16 Guest passes (RES-03) · 12 Report a fault (RES-02) · 6 View bill, pay online, receipt (RES-01) |
| Tawhid Moslim | 17 Check a pass, record entry (SG-02, SG-03) · 18 Record exit, visitors inside (SG-04, SG-07) · 19 Guard shifts (BM-09, SG-05) |
| Jannatul Ferdus Nishi | 5 Monthly bills (BM-03) · 13 Assign, close and reopen tickets (BM-06, BM-07) · 21 Announcements (BM-11, RES-08) |
| Ayesha Siddiqa | 4 Charge rates (CM-01) · 9 Expenses and approval (BM-08, CM-02) · 10 Monthly fund summary (BM-12, RES-05) |
| Adika Rahman | 14 Assigned tickets (MNT-01 to MNT-04) · 15 Report an extra problem (MNT-05) · 20 Emergency numbers (BM-10, SG-06) |

Shared by everyone and built first: 1 Log in (RES-06, SG-01, BM-01, CM-05, MNT-06), with seed data standing in
for 2 Building setup and 3 Accounts. Not built in Release 1: 7 Cash and bank claims, 8 Unpaid dues, 11 Committee
dashboard, 22 Service feedback. Online payment (feature 6) uses a simulated gateway with the same flow as a real
gateway sandbox (SRS v1.6); no real money moves.

## Project links

- Task board: [Trello](https://trello.com/b/eChz8VrJ)
- Wiki: see the **Wiki** tab of this repository

## Repository layout

| Path | What it holds |
|---|---|
| `docs/srs/SRS.md` | Software Requirements Specification, v1.6. This is the copy we edit |
| `archive/` folders under `docs/srs/` and `docs/sds/<class>/` | Archived Word versions, not maintained. The `.md` files are the current copies |
| `docs/srs/figures/` | Figures used in the SRS |
| `docs/srs/latex/` | LaTeX source of the SRS for the PDF (`main.tex` and `figures/`), made from `SRS.md`. Compile with XeLaTeX |
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
