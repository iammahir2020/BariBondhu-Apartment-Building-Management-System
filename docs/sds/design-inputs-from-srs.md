# Design inputs from the SRS

These notes were Appendix B of the SRS up to version 1.2. They describe design (states, use case relationships, data
flows and entities), so they moved here in SRS v1.3. Each class's SDS uses them, and the final SDS must agree with
them. Story, rule and NFR IDs refer to [docs/srs/SRS.md](../srs/SRS.md).

## State diagrams

| Object | States and transitions |
|---|---|
| Bill | Unpaid → Payment pending → Paid. Payment pending → Unpaid (failed, cancelled or 30-minute timeout with no success). Unpaid → Awaiting verification → Paid, or → Unpaid if rejected. Unpaid → Carried forward at the next bill run, if the same occupancy is still active, or at once if it returns to Unpaid while the newest bill is still Unpaid; if the newest bill is Paid, Payment pending or Awaiting verification, it waits for the next bill run (BR-05). Unpaid → Paid when a correction brings the total to ৳0 or below (BR-07). Paid and Carried forward are final. |
| Overpayment | Flagged (a gateway payment arrived for a bill that was already Paid, Awaiting verification or Carried forward) → Refunded when the manager confirms the money was returned outside the app (BR-04). |
| Payment claim | Awaiting verification → Accepted (the bill becomes Paid) or → Rejected with a reason (the bill returns to Unpaid). Both are final; after a rejection the resident can record a new claim. |
| Guest pass | Scheduled (before start) → Active → Partly used → Fully used. Scheduled, Active or Partly used → Cancelled (by the resident, or when the occupancy ends). Scheduled, Active or Partly used → Expired at the end time. Cancelled and Expired stop new entries only (BR-11). |
| Visit | Guests inside → Some left → All left. Guests inside past the pass end time are flagged Overstayed. Exits can be recorded even after the pass is Cancelled or Expired. |
| Ticket | Reported → Assigned → In progress ⇄ On hold; In progress → Fixed → Closed. Fixed → Assigned (reopened with a reason). Reported → Cancelled (by the resident, only when nobody else follows it; otherwise the resident just stops following and the ticket stays Reported). Reported → Duplicate or Won't fix (by the manager, with a reason). |
| Expense | Waiting for approval → Approved, or → Rejected. Rejected → Waiting for approval when the manager resubmits. Approved is final; corrections are new linked expenses. |
| Household account | Temporary password → Active (first log-in) → Ended (the manager ends the occupancy, only with no payment in progress). Temporary password → Temporary password expired after 7 days unused → Temporary password (the manager issues a new one). Active → Temporary password when the manager resets it. |
| Staff account | The same password states, ending in Deactivated instead of Ended. Covers guard, maintenance, committee and manager accounts; the administrator creates and deactivates the manager's (ADM-01). Deactivation is refused for a maintenance worker with open tickets and for the manager's own account (BM-02). |
| Opening balance | Waiting for approval → Approved, or → Rejected with a reason. Rejected → Waiting for approval when the manager enters a corrected figure. Approved is final (CM-02, BM-12). |
| Shift | Planned → On duty (start time reached) → Finished (end time reached). Planned → Removed when the guard is deactivated (BM-02). A shift has a start and end date-time, at most 24 hours apart, and may cross midnight (BM-09). |
| Fund summary | Draft → Published → Revised (when a late approval changes the month). |
| Announcement | Published → Removed. Edits keep it Published. An Urgent announcement stays pinned at the top of residents' home screens until its expiry time, then remains Published without the pin. |

## Use case relationships

These are the relationships the use case diagrams draw. Carrying unpaid bills forward and working out fund balances are steps inside Make monthly bills and Publish fund summary, not use cases of their own.

- Every use case except Reset password «include» Log in.
- Set new password «extend» Log in (first log-in with a temporary password); Reset password «extend» Log in (the user forgot the password). Every class has both.
- Record guest entry «include» Check guest pass.
- Pay bill «extend» View bill (bill is Unpaid and no payment is pending). Pay bill is abstract: Pay bill online and Record cash or bank payment specialise it.
- Download receipt «extend» View bill (bill is Paid).
- Follow existing ticket ("Me too") «extend» Report fault (an open ticket exists for the same place and category).
- Show emergency numbers «extend» Report fault (resident picks an emergency category).
- Send reminder «extend» See unpaid dues (late flats with an active household are selected).
- Reopen ticket «extend» Close ticket (ticket is Fixed but the repair didn't work).
- Enter opening balance «extend» Publish fund summary (first month in the system).
- Decide expense is abstract: Approve expense and Reject expense specialise it.

## Data flow diagram (Level 0)

Figure 1 of the SRS ([system-context.png](../srs/figures/system-context.png)) is the system context. The SDS redraws it in DFD notation as Level 0, with the whole system as one process. External entities: the six user roles, the payment gateway and the email service. The diagram is in [Data_Flow_Diagrams.md](system/Data_Flow_Diagrams.md).

## Main entities

Building, Block, Flat, Occupancy, UserAccount (with role), ChargeRate, RateChange, Bill, BillLine, Payment, PaymentClaim, Overpayment, Receipt, Ticket, TicketFollower, TicketStatusChange, WorkNote, CommonAreaPlace, GuestPass, Visit, Shift, EmergencyContact, Expense, ExpenseDecision, OpeningBalance, FundSummary, Announcement, Feedback, Notification, AuditLog.

## Role permissions

Moved here from SRS section 2.1.7 in SRS version 1.4. Every page and API route checks the user's role against this table (NFR-06). "Own" means limited to the user's own flat or own assigned work.

| Action | RES | SG | BM | CM | MNT | ADM |
|---|---|---|---|---|---|---|
| Set up the building; create or replace the manager account |  |  |  |  |  | Yes |
| Create and deactivate flat, guard, maintenance and committee accounts |  |  | Yes |  |  |  |
| End a household's occupancy |  |  | Yes |  |  |  |
| Set charge rates |  |  |  | Yes |  |  |
| Make and correct bills |  |  | Yes |  |  |  |
| See and pay a bill | Own |  | View all |  |  |  |
| Record a cash or bank payment claim | Own |  |  |  |  |  |
| Accept or reject a claim; record a payment received directly |  |  | Yes |  |  |  |
| See the defaulters list and send reminders |  |  | Yes |  |  |  |
| Report a fault, follow it, cancel it before assignment | Own |  |  |  |  |  |
| Assign, reopen and close tickets; mark Duplicate or Won't fix |  |  | Yes |  |  |  |
| Update ticket status, add work notes, report an extra problem |  |  |  |  | Own |  |
| Create and cancel guest passes | Own |  |  |  |  |  |
| Check passes; record guest entry and exit; see visitors inside |  | Yes |  |  |  |  |
| Record expenses |  |  | Yes |  |  |  |
| Approve or reject expenses and the opening balance |  |  |  | Yes |  |  |
| Publish the monthly fund summary |  |  | Yes |  |  |  |
| See the fund summary (totals only) | Yes |  | Yes | Yes |  |  |
| Send announcements |  |  | Yes |  |  |  |
| Read announcements | Yes |  | Yes | Yes |  |  |
| Give service feedback | Yes |  |  |  |  |  |
| Read feedback (anonymous entries show no flat) |  |  |  | Yes |  |  |
| Plan guard shifts |  |  | Yes |  |  |  |
| See own shift |  | Yes |  |  |  |  |
| Edit emergency numbers |  |  | Yes |  |  |  |
| See emergency numbers (999 always first) | Yes | Yes | Yes | Yes | Yes |  |
| See a resident's phone number | Own | No | Yes | No | No | No |
