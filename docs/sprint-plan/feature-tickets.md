# BariBondhu feature tickets: Sprint 1 and Sprint 2

Every feature the team builds for Release 1, split into tickets that each hold one task, per member, with the day it
starts, the day it is due and what it waits for. Agreed on 20 Nov 2026: three features per member, a simulated
payment gateway for feature 6, in-app notifications owned by Adika, and two sprints that end on **Fri 27 Nov**.
Sat 28 is a buffer day; the code is due on the 28th and the demo is on Sun 29.

| Sprint | Days | Goal |
|---|---|---|
| Sprint 1 | Sat 21 – Tue 24 Nov | Every shared table merged, upstream features built, notifications working |
| Sprint 2 | Wed 25 – Fri 27 Nov | Downstream features built, demo flows joined up, everything merged by Fri 27, 18:00 |
| Buffer | Sat 28 Nov | Fixes and a demo rehearsal only |

## How to read this file

**Ticket IDs** are `BB-FFNN`: `FF` is the feature number and `NN` the step, so `BB-1205` is feature 12, step 5.
`00` is shared setup and `23` is in-app notifications (a shared piece with no feature number of its own).

**Ticket kinds**, in the order every feature is built:

1. Re-read the story and write its test cases from the confirmation criteria
2. Table and migration (and seed rows other people can use)
3. Service functions with their tests, one rule group per ticket (these can start on fakes)
4. Adapters and API routes, with the role-check test
5. Pages, one screen per ticket, phone and laptop views from the prototype
6. PR: open it, fix the review comments, merge

**★** marks a ticket other members wait for. It goes in **its own small PR** and is merged by its due date, so the
others can build on real tables. "Waits for" names the ticket that has to be **merged** first; a service ticket that
waits for a table can still start on a fake.

**Linking tickets to Git and Trello**

- Trello card title: the ID and the task, e.g. `BB-1205 Service: report a fault`.
- PR title starts with the IDs it delivers: `BB-1202, BB-1203, BB-1204: Add ticket tables`. The PR body lists the
  Trello card links. Every ticket's card gets the PR link once it is opened.
- Commit messages stay short and imperative, with the ID at the end: `Add ticket tables (BB-1202)`.
- Branches stay one per feature as in CONTRIBUTING.md (`feature/mahir-report-fault`). A ★ ticket gets its own short
  branch (`feature/mahir-ticket-tables`).
- A ticket is done when its PR is merged into `main`.

## How the features depend on each other

```text
Money:    4 Rates (Ayesha) ──▶ 5 Bills (Nishi) ──▶ 6 Pay online (Mahir) ──▶ 10 Fund summary (Ayesha)
                                                     9 Expenses (Ayesha) ──┘
Repairs:  12 Report a fault (Mahir) ──▶ 13 Assign / close (Nishi) ──▶ 14 Assigned tickets (Adika) ──▶ 15 Extra problem (Adika)
Gate:     16 Guest passes (Mahir) ──▶ 17 Check pass, entry (Tawhid) ──▶ 18 Exit, visitors inside (Tawhid)
Alone:    19 Guard shifts (Tawhid) · 20 Emergency numbers (Adika, used by 12) · 21 Announcements (Nishi)
Shared:   00 Setup (Mahir, blocks everyone) · 23 Notifications (Adika, used by 5, 12–17, 21)
```

The ★ tables that unblock everyone, in the order they merge:

| By | Ticket | Unblocks |
|---|---|---|
| Sat 21 | BB-0001 Skeleton PR #21 merged | Everyone |
| Sat 21 | BB-0402, BB-0403 Charge rate table | Nishi's bills (5) |
| Sat 21 | BB-1202 Ticket tables | Nishi (13), Adika (14, 15) |
| Sat 21 | BB-2002, BB-2003 Emergency numbers table | Mahir's emergency path (12) |
| Sun 22 | BB-1203, BB-1204 Ticket state machine and sample tickets | Nishi (13), Adika (14, 15) |
| Sun 22 | BB-0502 – BB-0504 Bill tables, bill states, sample bills | Mahir (6), Ayesha (10) |
| Sun 22 | BB-1602, BB-1603 Guest pass table and sample passes | Tawhid (17, 18) |
| Sun 22 | BB-2301 Notifier interface | Everyone who sends a notification |
| Mon 23 | BB-1604 Pass status function | Tawhid's pass check (17) |

---

## Mahir Al Kamal (Resident): shared setup, features 12, 16 and 6

### 00 Shared setup

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-0001 | ★ Get the skeleton PR (#21) reviewed by a teammate and merged | 1 | Sat 21 | Sat 21 | — | Blocks everyone |
| BB-0002 | Send each member the `.env.local` values in a private message | 1 | Sat 21 | Sat 21 | — | Never in a public channel |
| BB-0003 | Invite the team to the Supabase project | 1 | Sat 21 | Sat 21 | — | |
| BB-0004 | Post the plan (this file) and the Trello board link on Discord | 1 | Sat 21 | Sat 21 | — | |
| BB-0010 | Page: Manager home (M-Dashboard, short version): bills collected this month, open and late tickets, expenses waiting for the committee, overpayments to refund; a card shows only once its page exists | 2 | Thu 26 | Fri 27 | — | Added 26 Nov. BM-01 lands here. Owners add their card when their page merges |
| BB-0011 | Page: Committee home (C-Home, short version): expenses waiting for a decision and the current rates | 2 | Thu 26 | Fri 27 | — | Added 26 Nov. CM-05 lands here. Ayesha adds the fund card with BB-1008; the full dashboard is CM-04 (feature 11, not in Release 1) |
| BB-0012 | Page: Admin home (A-Setup, read only): the building, blocks, flat count and the manager account | 2 | Thu 26 | Fri 27 | — | Added 26 Nov. Setup itself (ADM-01, feature 2) stays seeded for Release 1 |
| BB-0013 | The বাং button opens a "Bangla is coming soon" dialog, in the app shell and on the login screens | 2 | Thu 26 | Fri 27 | — | Added 26 Nov. Bangla itself (NFR-22) is not in anyone's tickets; team to decide |
| BB-0014 | PR: open, fix review comments (reviewer: Nishi), merge | 2 | Fri 27 | Fri 27 | BB-0010 – BB-0013 | Added 26 Nov |

### 12 Report a fault, "Me too", cancel (RES-02)

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-1201 | Re-read RES-02 and write its test cases | 1 | Sat 21 | Sat 21 | — | |
| BB-1202 | ★ Ticket tables and migration: Ticket (category, place or flat, title, description, photo, home times, status, priority, due date, assignee, instructions, found by staff, linked ticket), TicketFollower, TicketStatusChange, CommonAreaPlace | 1 | Sat 21 | Sat 21 | BB-0001 | Include every column 13, 14 and 15 need |
| BB-1203 | ★ Ticket state machine and its tests: Reported → Assigned → In progress ⇄ On hold → Fixed → Closed; Fixed → Assigned; Reported → Cancelled, Duplicate or Won't fix | 1 | Sat 21 | Sun 22 | BB-1202 | Nishi and Adika call it; only Mahir changes it |
| BB-1204 | ★ Seed: common-area places, and sample tickets in every state, some assigned to `bb-maintenance` | 1 | Sun 22 | Sun 22 | BB-1202 | Same PR as BB-1203 |
| BB-1205 | Service: report a fault inside my flat or in a common area ("Describe the problem") + tests | 1 | Sun 22 | Sun 22 | BB-1202 | |
| BB-1206 | Service: "Me too" on an open common-area ticket instead of a duplicate (BR-13) + tests | 1 | Mon 23 | Mon 23 | BB-1205 | |
| BB-1207 | Service: cancel my ticket (only while Reported with no other followers; otherwise I stop following) + tests | 1 | Mon 23 | Mon 23 | BB-1203 | |
| BB-1208 | Adapters and routes: report, list mine, "Me too", cancel (`reportFault`, Own) + role-check test | 1 | Mon 23 | Mon 23 | BB-1205 – BB-1207 | |
| BB-1209 | Page: Report a fault (R-ReportFault), with the emergency path showing 999 first | 1 | Tue 24 | Tue 24 | BB-1208, BB-2005 | |
| BB-1210 | Page: My tickets (R-Tickets) | 1 | Tue 24 | Tue 24 | BB-1208 | |
| BB-1211 | Notify the manager of a new or cancelled ticket, and the reporter and followers of status changes | 2 | Wed 25 | Wed 25 | BB-2306 | |
| BB-1212 | PR: open, fix review comments (reviewer: Nishi), merge | 2 | Wed 25 | Wed 25 | BB-1205 – BB-1211 | |

### 16 Create, share and cancel guest passes (RES-03)

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-1601 | Re-read RES-03 and write its test cases | 1 | Sat 21 | Sat 21 | — | |
| BB-1602 | ★ GuestPass table and migration (guest name, 1–20 guests, start, end, 6-digit code, guests used, cancelled at, occupancy), with the states Scheduled, Active, Partly used, Fully used, Cancelled, Expired | 1 | Sun 22 | Sun 22 | BB-0001 | Tawhid's Visit table links to it |
| BB-1603 | ★ Seed: passes in each state for the demo households | 1 | Sun 22 | Sun 22 | BB-1602 | Same PR as BB-1602 |
| BB-1604 | ★ Service: a pass's status at a given time + tests | 1 | Mon 23 | Mon 23 | BB-1602 | Small PR; Tawhid's pass check calls it |
| BB-1605 | Service: create a pass (1–20 guests, at most 24 hours, "Check the visit times", code unique among live passes, BR-11) + tests | 1 | Mon 23 | Mon 23 | BB-1602 | |
| BB-1606 | Service: cancel a pass and list my passes + tests | 1 | Tue 24 | Tue 24 | BB-1605 | |
| BB-1607 | Adapters and routes: create, list, cancel (`manageGuestPasses`, Own) + role-check test | 2 | Wed 25 | Wed 25 | BB-1605, BB-1606 | |
| BB-1608 | Page: New guest pass (R-GuestPass-New) | 2 | Wed 25 | Wed 25 | BB-1607 | |
| BB-1609 | Page: Pass code with QR code and Share (R-GuestPass-Code) | 2 | Thu 26 | Thu 26 | BB-1607 | |
| BB-1610 | PR: open, fix review comments (reviewer: Tawhid), merge | 2 | Thu 26 | Thu 26 | BB-1604 – BB-1609 | |

### 6 View bill, pay online, receipt (RES-01), with the simulated gateway

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-0601 | Re-read RES-01 and write its test cases | 1 | Sat 21 | Sat 21 | — | |
| BB-0602 | `PaymentGateway` interface and `SimulatedGateway` with its own test-transaction table (create payment, get status) + tests | 2 | Wed 25 | Thu 26 | — | Needs no bills; start earlier if there is time |
| BB-0603 | Payment, Receipt and Overpayment tables and migration | 2 | Thu 26 | Thu 26 | BB-0502 | |
| BB-0604 | Service: start a payment (Unpaid → Payment pending; Pay and cash claim disabled, BR-03) + tests | 2 | Thu 26 | Thu 26 | BB-0503, BB-0602 | |
| BB-0605 | Service: gateway confirmation (signature checked, amount equals the total BR-06, same confirmation twice changes nothing, Paid with a receipt BR-02, late confirmation becomes an overpayment BR-04) + tests | 2 | Thu 26 | Fri 27 | BB-0604 | |
| BB-0606 | Service: 30-minute timeout re-check back to Unpaid, and the reason for a failed or cancelled payment (BR-04) + tests | 2 | Fri 27 | Fri 27 | BB-0604 | |
| BB-0607 | Routes: my bills (`viewBills`, Own), start payment (`payBill`), gateway webhook (signed, no session) + role-check test | 2 | Fri 27 | Fri 27 | BB-0603 – BB-0606 | |
| BB-0608 | Page: test checkout `/sim-gateway/checkout/[txnId]` with Pay, Fail, Cancel, Pay but confirm late | 2 | Fri 27 | Fri 27 | BB-0607 | |
| BB-0609 | Page: Dues (R-Dues), with Pay and the bill's status | 2 | Fri 27 | Fri 27 | BB-0607 | |
| BB-0610 | Page: Receipt (R-Receipt) | 2 | Fri 27 | Fri 27 | BB-0607 | First to cut if late |
| BB-0611 | PR: open, fix review comments (reviewer: Ayesha), merge | 2 | Fri 27 | Fri 27 | BB-0602 – BB-0610 | |
| BB-0612 | Page: Resident home (R-Home): the current bill with Pay now and See bill, the New guest pass and Report a fault tiles, and my latest guest pass and ticket | 2 | Wed 25 | Fri 27 | BB-0607, BB-1208, BB-1607 | Added 25 Nov. Its own PR, opened after BB-0611 merges (reviewer: Ayesha). Nishi's Urgent pin (BB-2108) goes at the top of it |
| BB-0613 | Service and routes: list overpayments, mark one Refunded (who and when, audit log) (`decidePaymentClaims`; the overpayment part of BM-04, BR-04) + tests + role-check test | 2 | Thu 26 | Fri 27 | BB-0611 | Added 26 Nov. The rest of BM-04 (feature 7) stays out of Release 1 |
| BB-0614 | Page: Overpayments for the manager (from M-Claims, overpayments only), and the overpayment notice on Dues | 2 | Thu 26 | Fri 27 | BB-0613 | Added 26 Nov |
| BB-0615 | PR: open, fix review comments (reviewer: Ayesha), merge | 2 | Fri 27 | Fri 27 | BB-0613, BB-0614 | Added 26 Nov |

---

## Jannatul Ferdus Nishi (Building Manager): features 5, 13 and 21

### 00 Setup

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-0005 | Clone, `npm install`, fill `.env.local`, run the app, log in with a demo account | 1 | Sat 21 | Sat 21 | BB-0001 – BB-0003 | Steps in `code/README.md` |

### 5 Make and correct monthly bills (BM-03)

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-0501 | Re-read BM-03 and write its test cases | 1 | Sat 21 | Sat 21 | — | |
| BB-0502 | ★ Bill and BillLine tables and migration (month, due date, total in poisha, occupancy or flat; lines for each charge, carried forward and adjustment), with the states Unpaid, Payment pending, Awaiting verification, Paid, Carried forward | 1 | Sun 22 | Sun 22 | BB-0402 | Mahir (6) and Ayesha (10) build on it |
| BB-0503 | ★ Bill state machine and its tests | 1 | Sun 22 | Sun 22 | BB-0502 | Mahir calls it; only Nishi changes it |
| BB-0504 | ★ Seed: one month of bills for all 12 flats, mostly Unpaid and one Paid | 1 | Sun 22 | Sun 22 | BB-0502, BB-0403 | Same PR as BB-0502, BB-0503 |
| BB-0505 | Service: run a month's bills (every flat, a line per charge at its current rate; "Bills for this month already exist", "Ask the committee to set the charge rates first", "Check the due date") + tests | 1 | Mon 23 | Mon 23 | BB-0502 | |
| BB-0506 | Service: carry forward the same household's earlier Unpaid bills (BR-05) + tests | 1 | Mon 23 | Mon 23 | BB-0505 | |
| BB-0507 | Service: correct an Unpaid bill with a reason (BR-07), with an audit log entry + tests | 1 | Tue 24 | Tue 24 | BB-0503 | |
| BB-0508 | Adapters and routes: run bills, list all bills, correct a bill (`manageBills`, `viewBills`) + role-check test | 1 | Tue 24 | Tue 24 | BB-0505 – BB-0507 | |
| BB-0509 | Page: Bills (M-Bills) | 1 | Tue 24 | Tue 24 | BB-0508 | |
| BB-0510 | PR: open, fix review comments (reviewer: Mahir), merge | 2 | Wed 25 | Wed 25 | BB-0505 – BB-0509 | |

### 13 Assign, decline, close and reopen tickets (BM-06, BM-07)

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-1301 | Re-read BM-06 and BM-07 and write their test cases | 1 | Sat 21 | Sat 21 | — | |
| BB-1302 | Service: assign a ticket (staff member, priority, due date, instructions; "Choose a staff member and a due date") + tests | 1 | Tue 24 | Tue 24 | BB-1203 | Uses Mahir's ticket state machine |
| BB-1303 | Service: mark Duplicate (linking the original) or Won't fix, with a reason + tests | 2 | Wed 25 | Wed 25 | BB-1203 | |
| BB-1304 | Service: close a Fixed ticket, or reopen it with a reason + tests | 2 | Wed 25 | Wed 25 | BB-1203 | |
| BB-1305 | Service: late and overdue flags for the list (unassigned for 24 hours, 1 hour if Urgent; past its due date) + tests | 2 | Wed 25 | Wed 25 | BB-1202 | |
| BB-1306 | Adapters and routes: list all, assign, decline, close, reopen (`manageTickets`) + role-check test | 2 | Wed 25 | Wed 25 | BB-1302 – BB-1305 | |
| BB-1307 | Page: Tickets list and detail with the assign form (M-Tickets) | 2 | Thu 26 | Thu 26 | BB-1306 | |
| BB-1308 | PR: open, fix review comments (reviewer: Adika), merge | 2 | Thu 26 | Thu 26 | BB-1302 – BB-1307 | |

### 21 Announcements, send and read (BM-11, RES-08)

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-2101 | Re-read BM-11 and RES-08 and write their test cases | 1 | Sat 21 | Sat 21 | — | |
| BB-2102 | Announcement table and migration (title, message, audience all, one block or one floor, urgent, expiry, Published or Removed) | 1 | Sat 21 | Sat 21 | BB-0001 | |
| BB-2103 | Seed: two announcements, one of them Urgent | 1 | Sun 22 | Sun 22 | BB-2102 | |
| BB-2104 | Service: send, edit and remove ("Write a message", "Check the expiry time"), notifying the audience + tests | 2 | Thu 26 | Thu 26 | BB-2306 | |
| BB-2105 | Service: a resident's announcements (their block or floor; Urgent pinned until it expires) + tests | 2 | Thu 26 | Thu 26 | BB-2102 | |
| BB-2106 | Adapters and routes (`sendAnnouncements`, `readAnnouncements`) + role-check test | 2 | Fri 27 | Fri 27 | BB-2104, BB-2105 | |
| BB-2107 | Page: Announcements for the manager (M-Announcements) | 2 | Fri 27 | Fri 27 | BB-2106 | |
| BB-2108 | Page: Announcements for residents, and the Urgent pin on the resident home (R-Announcements, R-Home) | 2 | Fri 27 | Fri 27 | BB-2106 | The resident home page is BB-0612 |
| BB-2109 | PR: open, fix review comments (reviewer: Ayesha), merge | 2 | Fri 27 | Fri 27 | BB-2104 – BB-2108 | |

---

## Ayesha Siddiqa (Committee Member): features 4, 9 and 10

### 00 Setup

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-0006 | Clone, `npm install`, fill `.env.local`, run the app, log in with a demo account | 1 | Sat 21 | Sat 21 | BB-0001 – BB-0003 | Steps in `code/README.md` |

### 4 Charge rates and rate history (CM-01)

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-0401 | Re-read CM-01 and write its test cases | 1 | Sat 21 | Sat 21 | — | |
| BB-0402 | ★ ChargeRate table and migration (service, generator or water; amount in poisha; meeting date; set by; Current or Replaced) | 1 | Sat 21 | Sat 21 | BB-0001 | Nishi's bill tables need it on Sun 22 |
| BB-0403 | ★ Seed: a current rate for each of the three charges | 1 | Sat 21 | Sat 21 | BB-0402 | Same PR as BB-0402 |
| BB-0404 | Service: set a new rate (replaces the current one; "Enter a valid rate and meeting date"), with an audit log entry + tests | 1 | Sun 22 | Sun 22 | BB-0402 | |
| BB-0405 | Service: current rates and rate history (who, when, meeting date, old and new value) + tests | 1 | Sun 22 | Sun 22 | BB-0402 | |
| BB-0406 | Adapters and routes: set a rate (`setChargeRates`), rate history + role-check test | 1 | Sun 22 | Mon 23 | BB-0404, BB-0405 | Add a "see rate history" row to the permissions table |
| BB-0407 | Page: Rates and history (C-Rates) | 1 | Mon 23 | Mon 23 | BB-0406 | |
| BB-0408 | PR: open, fix review comments (reviewer: Nishi), merge | 1 | Tue 24 | Tue 24 | BB-0404 – BB-0407 | |

### 9 Record expenses, approve or reject them (BM-08, CM-02)

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-0901 | Re-read BM-08 and CM-02 and write their test cases | 1 | Sat 21 | Sat 21 | — | |
| BB-0902 | Expense table and migration (amount, date, category, description, receipt photo, corrects which expense; decisions with reason), with the states Waiting for approval, Approved, Rejected | 1 | Sun 22 | Sun 22 | BB-0001 | Ayesha's fund summary reads it |
| BB-0903 | Seed: expenses in each state | 1 | Sun 22 | Sun 22 | BB-0902 | |
| BB-0904 | Service: record an expense, edit it while waiting, resubmit after a rejection, add a correcting expense ("Check the expense date") + tests | 1 | Mon 23 | Mon 23 | BB-0902 | |
| BB-0905 | Service: approve, or reject with a reason ("Write a reason"; a decided expense can't change) + tests | 1 | Tue 24 | Tue 24 | BB-0902 | |
| BB-0906 | Adapters and routes (`recordExpenses`, `decideExpenses`) + role-check test | 1 | Tue 24 | Tue 24 | BB-0904, BB-0905 | |
| BB-0907 | Page: Expenses for the manager (M-Expenses) | 2 | Wed 25 | Wed 25 | BB-0906 | |
| BB-0908 | Page: Approve expenses for the committee (C-Expense) | 2 | Wed 25 | Wed 25 | BB-0906 | |
| BB-0909 | PR: open, fix review comments (reviewer: Nishi), merge | 2 | Thu 26 | Thu 26 | BB-0904 – BB-0908 | |

### 10 Monthly fund summary, with the opening balance (BM-12, RES-05)

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-1001 | Re-read BM-12 and RES-05 and write their test cases | 1 | Sat 21 | Sat 21 | — | |
| BB-1002 | OpeningBalance and FundSummary tables and migration (month, figures, Draft or Published; opening balance Waiting for approval, Approved or Rejected) | 2 | Wed 25 | Wed 25 | BB-0001 | |
| BB-1003 | Service: enter, approve or reject the opening balance + tests | 2 | Wed 25 | Thu 26 | BB-1002 | |
| BB-1004 | Service: work out a month (opening balance, collected from Paid bills, spent by category from Approved expenses, closing balance, total outstanding; BR-10) + tests | 2 | Thu 26 | Thu 26 | BB-0502, BB-0902 | |
| BB-1005 | Service: publish (only after the month has ended; the first month needs an approved opening balance) + tests | 2 | Thu 26 | Thu 26 | BB-1003, BB-1004 | |
| BB-1006 | Adapters and routes (`publishFundSummary`, `viewFundSummary`) + role-check test | 2 | Fri 27 | Fri 27 | BB-1003 – BB-1005 | |
| BB-1007 | Page: Fund for the manager, with the opening balance (M-Fund) | 2 | Fri 27 | Fri 27 | BB-1006 | |
| BB-1008 | Page: Fund summary for residents and the committee (R-Fund) | 2 | Fri 27 | Fri 27 | BB-1006 | |
| BB-1009 | PR: open, fix review comments (reviewer: Nishi), merge | 2 | Fri 27 | Fri 27 | BB-1002 – BB-1008 | |

Left out unless there is time: the "Revised" recalculation of later months after a late approval, and sending the
summary as an announcement.

---

## Tawhid Moslim (Security Guard): features 19, 17 and 18

### 00 Setup

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-0007 | Clone, `npm install`, fill `.env.local`, run the app, log in with a demo account | 1 | Sat 21 | Sat 21 | BB-0001 – BB-0003 | Steps in `code/README.md` |

### 19 Plan and view guard shifts (BM-09, SG-05)

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-1901 | Re-read BM-09 and SG-05 and write their test cases | 1 | Sat 21 | Sat 21 | — | |
| BB-1902 | Shift table and migration (guard, start, end), with the states Planned, On duty, Finished, Removed | 1 | Sat 21 | Sat 21 | BB-0001 | |
| BB-1903 | Seed: shifts for the next 7 days, with one gap | 1 | Sun 22 | Sun 22 | BB-1902 | |
| BB-1904 | Service: plan a shift ("This guard already has a shift then"; "Check the shift times": at most 24 hours, may cross midnight) + tests | 1 | Sun 22 | Sun 22 | BB-1902 | |
| BB-1905 | Service: duty list with the gaps in the next 7 days, and a guard's own shifts ("No shift today") + tests | 1 | Sun 22 | Mon 23 | BB-1902 | |
| BB-1906 | Adapters and routes (`planShifts`, `viewOwnShift`) + role-check test | 1 | Mon 23 | Mon 23 | BB-1904, BB-1905 | |
| BB-1907 | Page: Shifts for the manager (M-Shifts) | 1 | Mon 23 | Mon 23 | BB-1906 | |
| BB-1908 | Page: Duty for the guard (G-Duty) | 1 | Tue 24 | Tue 24 | BB-1906 | |
| BB-1909 | PR: open, fix review comments (reviewer: Adika), merge | 1 | Tue 24 | Tue 24 | BB-1904 – BB-1908 | |

### 17 Check a pass and record entry (SG-02, SG-03)

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-1701 | Re-read SG-02 and SG-03 and write their test cases | 1 | Sat 21 | Sat 21 | — | |
| BB-1702 | Service: check a code (valid; Expired, Cancelled or "Valid from"; "No pass with this code"; Fully used) + tests | 1 | Sun 22 | Mon 23 | BB-1604 | Start on a fake until BB-1604 merges |
| BB-1703 | Visit table and migration (pass, guests in, guests out, entry time, guard, entered later), with the states Guests inside, Some left, All left, Overstayed | 1 | Mon 23 | Mon 23 | BB-1602 | |
| BB-1704 | Service: record entry (1 up to the number remaining; "Entered later" from the paper register; the resident is notified) + tests | 1 | Tue 24 | Tue 24 | BB-1703 | |
| BB-1705 | Adapters and routes: check, record entry (`runGate`) + role-check test | 1 | Tue 24 | Tue 24 | BB-1702, BB-1704 | |
| BB-1706 | Page: Check a pass with the valid and invalid results (G-Home, G-Pass-Valid, G-Pass-Invalid) | 2 | Tue 24 | Wed 25 | BB-1705 | |
| BB-1707 | Page: "No connection: use the intercom and paper register" within 5 seconds, and the Entered later form | 2 | Wed 25 | Wed 25 | BB-1706 | |
| BB-1708 | PR: open, fix review comments (reviewer: Mahir), merge | 2 | Wed 25 | Wed 25 | BB-1702 – BB-1707 | |

### 18 Record exit and see visitors inside (SG-04, SG-07)

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-1801 | Re-read SG-04 and SG-07 and write their test cases | 1 | Sat 21 | Sat 21 | — | |
| BB-1802 | Service: record an exit ("No guests from this pass are inside"; allowed after the pass is cancelled or expired) + tests | 2 | Wed 25 | Thu 26 | BB-1703 | |
| BB-1803 | Service: visitors inside, with Overstayed passes + tests | 2 | Thu 26 | Thu 26 | BB-1703 | |
| BB-1804 | Adapters and routes (`runGate`) + role-check test | 2 | Thu 26 | Thu 26 | BB-1802, BB-1803 | |
| BB-1805 | Page: Visitors inside, with Exit (G-Inside) | 2 | Fri 27 | Fri 27 | BB-1804 | |
| BB-1806 | PR: open, fix review comments (reviewer: Mahir), merge | 2 | Fri 27 | Fri 27 | BB-1802 – BB-1805 | |

---

## Adika Rahman (Maintenance Staff): features 20, 14 and 15, and in-app notifications

### 00 Setup

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-0008 | Clone, `npm install`, fill `.env.local`, run the app, log in with a demo account | 1 | Sat 21 | Sat 21 | BB-0001 – BB-0003 | Steps in `code/README.md` |

### 20 Emergency numbers, edit and show (BM-10, SG-06)

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-2001 | Re-read BM-10 and SG-06 and write their test cases | 1 | Sat 21 | Sat 21 | — | |
| BB-2002 | ★ EmergencyContact table and migration (label, phone, order) | 1 | Sat 21 | Sat 21 | BB-0001 | Mahir's fault page shows these numbers |
| BB-2003 | ★ Seed: the guard desk and manager numbers | 1 | Sat 21 | Sat 21 | BB-2002 | Same PR as BB-2002 |
| BB-2004 | Service: list the numbers (999 always first) and change one ("Enter a valid phone number", 9 to 11 digits) + tests | 1 | Sun 22 | Sun 22 | BB-2002 | |
| BB-2005 | Adapters and routes (`viewEmergencyNumbers`, `editEmergencyNumbers`) + role-check test | 1 | Sun 22 | Sun 22 | BB-2004 | |
| BB-2006 | Page: Emergency for every role (S-Emergency), still showing the last loaded numbers when offline | 1 | Mon 23 | Mon 23 | BB-2005 | |
| BB-2007 | Page: Edit numbers for the manager (M-Emergency) | 1 | Mon 23 | Mon 23 | BB-2005 | |
| BB-2008 | PR: open, fix review comments (reviewer: Tawhid), merge | 1 | Mon 23 | Mon 23 | BB-2004 – BB-2007 | |

### 23 In-app notifications (shared)

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-2301 | ★ `Notifier` interface and a do-nothing fake, so every service can call it now | 1 | Sun 22 | Sun 22 | BB-0001 | Small PR; everyone codes against it |
| BB-2302 | Notification table and migration (recipient, text, link, read at) | 1 | Sun 22 | Sun 22 | BB-0001 | |
| BB-2303 | Service: send a notification, list mine, mark as read + tests | 1 | Mon 23 | Mon 23 | BB-2301, BB-2302 | |
| BB-2304 | Adapters and routes: list mine, mark as read (a new permissions row for every role) + role-check test | 1 | Tue 24 | Tue 24 | BB-2303 | |
| BB-2305 | Page: bell with the unread count in the app shell, and a Notifications page | 1 | Tue 24 | Tue 24 | BB-2304 | |
| BB-2306 | PR: open, fix review comments (reviewer: Mahir), merge | 1 | Tue 24 | Tue 24 | BB-2302 – BB-2305 | After it merges, everyone swaps the fake for the real notifier |

### 14 Assigned tickets: list, details, status, work notes (MNT-01 – MNT-04)

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-1401 | Re-read MNT-01 to MNT-04 and write their test cases | 1 | Sat 21 | Sat 21 | — | |
| BB-1402 | WorkNote table and migration (ticket, author, text up to 1,000 characters, time) | 1 | Tue 24 | Tue 24 | BB-1202 | |
| BB-1403 | Service: my assigned tickets (Urgent first, then by due date; "No tickets assigned to you") and a ticket's details ("This ticket is no longer assigned to you") + tests | 1 | Tue 24 | Tue 24 | BB-1204 | |
| BB-1404 | Service: start, put on hold with a reason, resume, mark Fixed (through the ticket state machine; never Assigned straight to Fixed) + tests | 2 | Wed 25 | Wed 25 | BB-1203 | |
| BB-1405 | Service: add a work note ("Write a note"; "Note saved") + tests | 2 | Wed 25 | Wed 25 | BB-1402 | |
| BB-1406 | Adapters and routes (`workOnTickets`, own tickets only through `requireOwnTicket`) + role-check test | 2 | Wed 25 | Wed 25 | BB-1403 – BB-1405 | |
| BB-1407 | Page: My tickets (T-List) | 2 | Thu 26 | Thu 26 | BB-1406 | |
| BB-1408 | Page: Ticket detail with status buttons and work notes (T-Detail) | 2 | Thu 26 | Thu 26 | BB-1406 | |
| BB-1409 | PR: open, fix review comments (reviewer: Nishi), merge | 2 | Thu 26 | Thu 26 | BB-1402 – BB-1408 | |

### 15 Report an extra problem (MNT-05)

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-1501 | Re-read MNT-05 and write its test cases | 1 | Sat 21 | Sat 21 | — | |
| BB-1502 | Service: report an extra problem (a new Reported ticket, marked Found by staff and linked to mine; the manager is notified) + tests | 2 | Thu 26 | Fri 27 | BB-1202 | |
| BB-1503 | Adapter and route (`workOnTickets`) + role-check test | 2 | Fri 27 | Fri 27 | BB-1502 | |
| BB-1504 | Page: Report an extra problem (T-ExtraProblem) | 2 | Fri 27 | Fri 27 | BB-1503 | |
| BB-1505 | PR: open, fix review comments (reviewer: Nishi), merge | 2 | Fri 27 | Fri 27 | BB-1502 – BB-1504 | |

---

## Buffer day, Sat 28 Nov (everyone)

| ID | Task | Sprint | Start | Due | Waits for | Notes |
|---|---|---|---|---|---|---|
| BB-0009 | Demo rehearsal of the four flows: gate, repairs, money, fund | Buffer | Sat 28 | Sat 28 | All PRs merged | Fix only what breaks |

## Reviewers

The downstream member reviews, because they need the code to work.

| Feature | Owner | Reviewer |
|---|---|---|
| 4 Charge rates | Ayesha | Nishi |
| 5 Monthly bills | Nishi | Mahir |
| 6 Pay online | Mahir | Ayesha |
| 9 Expenses | Ayesha | Nishi |
| 10 Fund summary | Ayesha | Nishi |
| 12 Report a fault | Mahir | Nishi |
| 13 Ticket assignment | Nishi | Adika |
| 14 Assigned tickets | Adika | Nishi |
| 15 Extra problem | Adika | Nishi |
| 16 Guest passes | Mahir | Tawhid |
| 17 Check pass, entry | Tawhid | Mahir |
| 18 Exit, visitors inside | Tawhid | Mahir |
| 19 Guard shifts | Tawhid | Adika |
| 20 Emergency numbers | Adika | Tawhid |
| 21 Announcements | Nishi | Ayesha |
| 23 Notifications | Adika | Mahir |

## Tickets per member

| Member | Sprint 1 | Sprint 2 | Total |
|---|---|---|---|
| Mahir | 21 | 25 | 46 |
| Nishi | 15 | 13 | 28 |
| Ayesha | 16 | 11 | 27 |
| Tawhid | 16 | 8 | 24 |
| Adika | 19 | 10 | 29 |
| Everyone (buffer day) | | | 1 |
| **All** | **87** | **67** | **155** |

Mahir carries the most, mostly in Sprint 2 (feature 6 on Thu 26 and Fri 27), while Tawhid has the lightest Sprint 2.

## Every day

- Stand-up call on Discord at **23:00 every night** (calendar invite sent): what I finished, what I start next, what
  blocks me.
- Move your Trello cards as you go (To do → Doing → Review → Done).
- If a ★ ticket is late, say so on Discord at once: other members are waiting for it.

## If something slips

Cut in this order, and say so on Discord:

1. The receipt download in feature 6 (BB-0610)
2. The "Revised" recalculation and the announcement link in feature 10 (not ticketed)
3. The Entered later form in feature 17 (part of BB-1707)
4. Use the buffer day, Sat 28
