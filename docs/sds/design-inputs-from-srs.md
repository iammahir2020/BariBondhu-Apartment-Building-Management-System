# Design inputs from the SRS

These notes were Appendix B of the SRS up to version 1.2. They describe design (states, use case relationships, data
flows and entities), so they moved here in SRS v1.3. Each class's SDS uses them, and the final SDS must agree with
them. Story, rule and NFR IDs refer to [docs/srs/SRS.md](../srs/SRS.md).

## State diagrams

| Object | States and transitions |
|---|---|
| Bill | Unpaid → Payment pending → Paid. Payment pending → Unpaid (failed, cancelled or 30-minute timeout with no success). Unpaid → Awaiting verification → Paid, or → Unpaid if rejected. Unpaid → Carried forward at the next bill run, if the same occupancy is still active, or at once if the bill returns to Unpaid after a newer bill exists (BR-05). Unpaid → Paid when a correction brings the total to ৳0 or below (BR-07). Paid and Carried forward are final. |
| Overpayment | Flagged (a gateway payment arrived for a bill that was already Paid, Awaiting verification or Carried forward) → Refunded when the manager confirms the money was returned outside the app (BR-04). |
| Payment claim | Awaiting verification → Accepted (the bill becomes Paid) or → Rejected with a reason (the bill returns to Unpaid). Both are final; after a rejection the resident can record a new claim. |
| Guest pass | Scheduled (before start) → Active → Partly used → Fully used. Scheduled, Active or Partly used → Cancelled (by the resident, or when the occupancy ends). Scheduled, Active or Partly used → Expired at the end time. Cancelled and Expired stop new entries only (BR-11). |
| Visit | Guests inside → Some left → All left. Guests inside past the pass end time are flagged Overstayed. Exits can be recorded even after the pass is Cancelled or Expired. |
| Ticket | Reported → Assigned → In progress ⇄ On hold; In progress → Fixed → Closed. Fixed → Assigned (reopened with a reason). Reported → Cancelled (by the resident). Reported → Duplicate or Won't fix (by the manager, with a reason). |
| Expense | Waiting for approval → Approved, or → Rejected. Rejected → Waiting for approval when the manager resubmits. Approved is final; corrections are new linked expenses. |
| Occupancy / account | Active → Ended (household moved out) or Deactivated (by the manager or, for the manager account, the administrator). |
| Opening balance | Waiting for approval → Approved, or → Rejected with a reason. Rejected → Waiting for approval when the manager enters a corrected figure. Approved is final (CM-02, BM-12). |
| Shift | Planned → removed when the guard is deactivated (BM-02). A shift has a start and end date-time, at most 24 hours apart, and may cross midnight (BM-09). |
| Fund summary | Draft → Published → Revised (when a late approval changes the month). |
| Announcement | Published → Removed. Edits keep it Published. An Urgent announcement stays pinned at the top of residents' home screens until its expiry time, then remains Published without the pin. |

## Use case relationships

- Log in is a precondition for every use case except Reset password.
- Record guest entry «include» Check guest pass.
- Make monthly bills «include» Carry forward unpaid bills.
- Publish fund summary «include» Calculate balances.
- Pay bill online «extend» View bill (only when the bill is Unpaid).
- Record cash payment «extend» View bill (only when the bill is Unpaid and no payment is pending).
- Download receipt «extend» View bill (only when the bill is Paid).
- Follow existing ticket ("Me too") «extend» Report fault (only when a matching open ticket exists).
- Show emergency numbers «extend» Report fault (only for emergency categories).

## Data flow diagrams (Level 0 and Level 1)

Figure 1 of the SRS ([system-context.png](../srs/figures/system-context.png)) is the system context. The SDS redraws it in DFD notation as Level 0, with the whole system as one process. Level 1 splits that process into six: 1 Manage accounts, 2 Billing and payments, 3 Fault tickets, 4 Gate and guests, 5 Building fund, 6 Communication. External entities: the six user roles, the payment gateway and the email service. Main data stores: Accounts and occupancies, Bills and payments, Tickets, Passes and visits, Expenses and summaries, Announcements and feedback, Audit log.

## Main entities

Building, Block, Flat, Occupancy, UserAccount (with role), ChargeRate, RateChange, Bill, BillLine, Payment, PaymentClaim, Receipt, Ticket, TicketFollower, TicketStatusChange, WorkNote, CommonAreaPlace, GuestPass, Visit, Shift, EmergencyContact, Expense, ExpenseDecision, OpeningBalance, FundSummary, Announcement, Feedback, Notification, AuditLog.
