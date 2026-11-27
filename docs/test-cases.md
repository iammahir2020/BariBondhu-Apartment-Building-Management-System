# Test cases: RES-01, RES-02 and RES-03

The test cases for my three features. I wrote them from each story's confirmation criteria and the business rules
and NFRs it cites in [SRS.md](srs/SRS.md). Each case becomes one or more Jest tests in the ticket named in **Built in**,
and the case ID goes in the test name, so a failing test points back to this table.

| Feature | Story | Tickets |
|---|---|---|
| 12 Report a fault, "Me too", cancel | RES-02 | BB-1201 (this file), BB-1203 – BB-1211 |
| 16 Create, share and cancel guest passes | RES-03 | BB-1601 (this file), BB-1604 – BB-1609 |
| 6 View bill, pay online, receipt | RES-01 | BB-0601 (this file), BB-0602 – BB-0610 |

**Type** follows the four kinds in our testing approach (report section 11):

- **Normal**: the main success path.
- **Boundary**: the edges the SRS names (1 and 20 guests, exactly 24 hours, 5 MB, 30 minutes).
- **Invalid**: missing, wrong or out-of-range input.
- **Exception**: wrong state, not found, already done, wrong role, or a dependency that fails.

All times are Asia/Dhaka and all amounts are ৳ with two decimals (BR-01).

## RES-02 · Report a fault

| ID | Type | Case | Expected result | Source | Built in |
|---|---|---|---|---|---|
| TC-R02-01 | Normal | Inside my flat: category Plumbing, title, description, no photo, home times | Ticket created as Reported, Normal priority, linked to my flat and occupancy; my household follows it; manager notified | RES-02 c1 | BB-1205, BB-1211 |
| TC-R02-02 | Normal | Common area: place Lift 1, category Lift, no open ticket for that place and category | New ticket created as Reported against Lift 1 | RES-02 c1, BR-13 | BB-1205 |
| TC-R02-03 | Normal | Common area: Water pump + Plumbing while an Assigned ticket exists for the same place and category | The existing ticket is shown with a "Me too" button instead of a new form | RES-02 c2, BR-13 | BB-1206, BB-1209 |
| TC-R02-04 | Normal | Tap "Me too" on that ticket | My household now follows it; no new ticket; the follower count goes up by one | RES-02 c2 | BB-1206 |
| TC-R02-05 | Boundary | The matching ticket is Fixed (not yet Closed) | Still counts as open: "Me too" is offered | BR-13 | BB-1206 |
| TC-R02-06 | Boundary | The only ticket for that place and category is Closed, Cancelled, Duplicate or Won't fix | No match: a new ticket is created | BR-13 | BB-1206 |
| TC-R02-07 | Boundary | Same place, different category (Lift 1 + Electrical vs an open Lift 1 + Lift ticket) | No match: a new ticket is created | BR-13 | BB-1206 |
| TC-R02-08 | Invalid | Tap "Me too" twice, or on a ticket my household already follows | Still one follower row; no error shown to the user | RES-02 c2 | BB-1206 |
| TC-R02-09 | Invalid | "Me too" on an inside-flat ticket, or on a final ticket | Refused (409); nothing changes | BR-13 | BB-1206 |
| TC-R02-10 | Normal | Pick "Fire or gas smell" or "Someone stuck in a lift" | 999 shown first, then the guard-desk and manager numbers, each with a one-tap Call, before any form field | RES-02 c3, BR-12, NFR-16 | BB-1209 |
| TC-R02-11 | Normal | From the emergency screen, tap "Log it for repair" | Ticket created as Reported with Urgent priority (Fire or gas smell, or Lift for someone stuck); manager notified | RES-02 c4 | BB-1205, BB-1209 |
| TC-R02-12 | Invalid | Submit with an empty description, or only spaces | "Describe the problem"; no ticket created | RES-02 c8 | BB-1205 |
| TC-R02-13 | Invalid | Common area with no place chosen, or both a flat and a place | Refused (400); no ticket created (the database also refuses it) | BR-13 | BB-1205 |
| TC-R02-14 | Invalid | A place that is switched off or doesn't exist | Refused; switched-off places are not in the list | BR-13 | BB-1205 |
| TC-R02-15 | Boundary | Photo: JPG or PNG of exactly 5 MB | Accepted | NFR-09 | BB-1205 |
| TC-R02-16 | Invalid | Photo over 5 MB, or a GIF, PDF or HEIC file | Refused with a message; no ticket created | NFR-09 | BB-1205 |
| TC-R02-17 | Normal | Cancel my Reported ticket that nobody else follows | Status Cancelled; a status change row saved; manager notified | RES-02 c6 | BB-1207, BB-1211 |
| TC-R02-18 | Normal | Cancel my Reported ticket that two other households follow | I stop following; the ticket stays Reported for them | RES-02 c7 | BB-1207 |
| TC-R02-19 | Exception | Cancel my ticket after it is Assigned (or any later status) | Refused (409); only the manager can close it | RES-02 c6, BB-1203 | BB-1203, BB-1207 |
| TC-R02-20 | Exception | Cancel or "Me too" with another household's ticket ID | Refused (403); nothing changes | NFR-06 (Own) | BB-1208 |
| TC-R02-21 | Normal | The manager assigns my ticket, or staff mark it In progress, On hold or Fixed | My household and every follower get a notification | RES-02 c5, NFR-29 | BB-1211 |
| TC-R02-22 | Normal | Open My tickets | Only my household's reported and followed tickets, each with its current status | RES-02, BR-09 | BB-1208, BB-1210 |
| TC-R02-23 | Exception | A new household in the same flat opens My tickets | The earlier household's tickets are not shown | BR-09, NFR-13 | BB-1208 |
| TC-R02-24 | Exception | Guard, manager, committee, maintenance or admin calls the report, "Me too" or cancel route; or nobody is signed in | 403 for each other role; 401 when signed out | NFR-06 | BB-1208 |
| TC-R02-25 | Exception | The photo upload to Storage fails | No ticket created; the error is shown and the form keeps what was typed | RES-02 c1 | BB-1205, BB-1209 |

## RES-03 · Pre-approve guests

| ID | Type | Case | Expected result | Source | Built in |
|---|---|---|---|---|---|
| TC-R03-01 | Normal | Guest name, 4 guests, today 18:00 to 22:00 | Pass saved as Scheduled; a 6-digit code and matching QR code shown, with Share | RES-03 c1, BR-11 | BB-1605, BB-1609 |
| TC-R03-02 | Boundary | 1 guest, and 20 guests | Both saved | RES-03 c1 | BB-1605 |
| TC-R03-03 | Invalid | 0 guests, 21 guests, a negative number or 2.5 | Refused; no pass created | RES-03 c1 | BB-1605 |
| TC-R03-04 | Boundary | Start to end exactly 24 hours | Saved | BR-11 | BB-1605 |
| TC-R03-05 | Boundary | Start to end 24 hours and 1 minute | "Check the visit times"; no pass created | RES-03 c2 | BB-1605 |
| TC-R03-06 | Invalid | End time before the start time, or equal to it | "Check the visit times"; no pass created | RES-03 c2 | BB-1605 |
| TC-R03-07 | Invalid | End time already past | "Check the visit times"; no pass created | RES-03 c2 | BB-1605 |
| TC-R03-08 | Boundary | 22:00 today to 02:00 tomorrow | Saved; the pass crosses midnight | BR-11 | BB-1605 |
| TC-R03-09 | Invalid | Empty guest name, or missing start or end | Refused; no pass created | RES-03 c1 | BB-1605 |
| TC-R03-10 | Normal | Look at the code | Exactly 6 digits, leading zeros kept ("004271") | BR-11 | BB-1605 |
| TC-R03-11 | Exception | The random code matches a pass that is Scheduled, Active or Partly used | A new code is drawn; the saved code is unique among live passes | BR-11 | BB-1605 |
| TC-R03-12 | Boundary | The random code matches only an Expired or Cancelled pass | The code is allowed | BR-11 | BB-1605 |
| TC-R03-13 | Normal | Code generation uses a secure random source (`crypto`), not `Math.random` | Inspection and a test with a fake random source | NFR-08 | BB-1605 |
| TC-R03-14 | Normal | Status before the start time | Scheduled | State diagram | BB-1604 |
| TC-R03-15 | Boundary | Status exactly at the start time, with no one checked in | Active | State diagram | BB-1604 |
| TC-R03-16 | Normal | Pass for 4, 1 to 3 guests checked in | Partly used | State diagram | BB-1604 |
| TC-R03-17 | Boundary | Pass for 4, 4 guests checked in | Fully used; the guard's check refuses a 5th guest | RES-03 c3 | BB-1604 (Tawhid's check in feature 17 uses it) |
| TC-R03-18 | Boundary | Status exactly at the end time, and one minute after | Expired from the end time on, for anyone who checks the code | RES-03 c6 | BB-1604 |
| TC-R03-19 | Normal | Cancel a Scheduled, Active or Partly used pass | Cancelled at once; the code refuses new entries; guests already inside can still be checked out | RES-03 c4, BR-11 | BB-1606 |
| TC-R03-20 | Exception | Cancel a pass that is already Cancelled, Expired or Fully used | Refused (409); nothing changes | State diagram | BB-1606 |
| TC-R03-21 | Normal | List my passes | Only my household's passes, each with its status at the current time | RES-03, BR-09 | BB-1606 |
| TC-R03-22 | Exception | A new household in the same flat lists passes | The earlier household's passes are not shown | BR-09, NFR-13 | BB-1606 |
| TC-R03-23 | Exception | Cancel another household's pass by ID | Refused (403); nothing changes | NFR-06 (Own) | BB-1607 |
| TC-R03-24 | Exception | Guard, manager, committee, maintenance or admin calls the create, list or cancel route; or nobody is signed in | 403 for each other role; 401 when signed out | NFR-06 | BB-1607 |
| TC-R03-25 | Normal | The guard checks in my guests | I get a notification with the number of guests who arrived | RES-03 c5, NFR-29 | Feature 17 (Tawhid) with feature 23 (Adika) |
| TC-R03-26 | Normal | From Home, create a pass and reach the code screen | At most 4 taps | NFR-24 | BB-1608, BB-1609 |

## RES-01 · See and pay my monthly bill

| ID | Type | Case | Expected result | Source | Built in |
|---|---|---|---|---|---|
| TC-R01-01 | Normal | Open Dues with a bill for the month | Each charge (service, generator, water) with its rate, any Carried forward or adjustment line, the total and the due date | RES-01 c1 | BB-0609 |
| TC-R01-02 | Normal | Check the total | Equals the sum of the lines, to the poisha | NFR-26 | BB-0609 (rule owned by feature 5) |
| TC-R01-03 | Normal | Tap Pay on an Unpaid bill | Bill becomes Payment pending; the gateway checkout opens; Pay and Record cash payment are both disabled | RES-01 c2, BR-03 | BB-0604, BB-0609 |
| TC-R01-04 | Exception | Start a payment on a bill that is Payment pending, Awaiting verification, Paid or Carried forward | Refused (409); no second payment starts | BR-03 | BB-0604 |
| TC-R01-05 | Normal | The gateway sends a valid confirmation while the bill is Payment pending | Bill becomes Paid; a receipt is made with a receipt number and the gateway's transaction ID | RES-01 c3, BR-02 | BB-0605 |
| TC-R01-06 | Normal | I closed the app halfway; the confirmation arrives; I open Dues later | The bill shows Paid and the receipt can be downloaded | RES-01 c3 | BB-0605, BB-0609 |
| TC-R01-07 | Boundary | A valid confirmation arrives after the bill timed out back to Unpaid | Bill becomes Paid | BR-04 | BB-0605 |
| TC-R01-08 | Exception | The same confirmation arrives twice | The second changes nothing: still one Payment and one Receipt | BR-02 | BB-0605 |
| TC-R01-09 | Exception | A confirmation arrives for a bill that is already Paid, Awaiting verification or Carried forward | The money is recorded as an Overpayment flagged to the manager; the bill doesn't change | BR-04 | BB-0605 |
| TC-R01-10 | Invalid | A confirmation with a wrong or missing signature | Refused; the bill doesn't change | BR-02 | BB-0605, BB-0607 |
| TC-R01-11 | Invalid | A confirmation whose amount is not the bill total (less or more) | Refused; the bill doesn't become Paid | BR-06 | BB-0605 |
| TC-R01-12 | Exception | The phone reports success (return URL) but no server confirmation arrives | The bill stays Payment pending; only the server-to-server confirmation makes it Paid | BR-02, NFR-15 | BB-0605 |
| TC-R01-13 | Boundary | Payment pending for 29 minutes 59 seconds | No re-check yet; still Payment pending | BR-04 | BB-0606 |
| TC-R01-14 | Boundary | Payment pending for 30 minutes; the gateway reports no successful payment | Bill returns to Unpaid and Pay works again | RES-01 c4, BR-04 | BB-0606 |
| TC-R01-15 | Boundary | Payment pending for 30 minutes; the gateway reports a successful payment | Bill becomes Paid with a receipt | BR-04 | BB-0606 |
| TC-R01-16 | Exception | The gateway can't be reached during the re-check | The bill stays Payment pending and is checked again later; it never becomes Paid without a confirmation | BR-02, BR-04 | BB-0606 |
| TC-R01-17 | Normal | The payment fails, or I cancel it at the gateway | Bill back to Unpaid, with the gateway's reason shown on Dues | RES-01 c5 | BB-0606, BB-0609 |
| TC-R01-18 | Normal | Download the receipt of a Paid bill | Receipt shows the receipt number, the gateway transaction ID, the amount and the date paid | RES-01 c3 | BB-0610 |
| TC-R01-19 | Exception | Ask for a receipt of a bill that isn't Paid | Refused (404 or 409); no receipt link on the page | Use case: Download receipt | BB-0607, BB-0610 |
| TC-R01-20 | Exception | Open or pay another household's bill by ID | Refused (403) | NFR-06 (Own), BR-09 | BB-0607 |
| TC-R01-21 | Exception | Any role other than resident calls my bills or start payment; or nobody is signed in | 403 for each other role; 401 when signed out. The webhook takes no session and is checked by its signature only | NFR-06 | BB-0607 |
| TC-R01-22 | Exception | A new household in the same flat opens Dues | The earlier household's bills are not shown | BR-09, NFR-13 | BB-0607 |
| TC-R01-23 | Normal | From Home, pay the current bill | At most 4 taps to reach the gateway | NFR-24 | BB-0609 |
| TC-R01-24 | Normal | The manager sends a reminder for my overdue bill | A notification that opens the bill | RES-01 c6 | Not built: reminders are feature 8, which we cut |

## Decisions

The SRS leaves these open, so I settled them before the service tickets. The tests use this wording.

1. RES-02: a resident's report needs a short title. Without one: "Give it a short title".
2. RES-02: a photo that is too big or the wrong type (NFR-09): "Use a JPG or PNG photo of 5 MB or less".
3. RES-03: a guest count outside 1 to 20: "Enter 1 to 20 guests". An empty guest name: "Enter the guest's name".
4. RES-03: a pass whose start time has already passed but whose end time hasn't is allowed. It is Active at once,
   since c2 only refuses an end time that is past.
5. RES-03: a Fully used pass stays Fully used after its end time. The state diagram has no way out of Fully used, so
   TC-R03-18 (Expired at the end time) applies to passes that still had guests to come.
6. RES-02: once a ticket is Assigned, nobody can stop following it. While it is Reported, a reporter whose ticket
   other households follow only stops following (TC-R02-18).
7. The status of a guest pass is worked out from its times, guests used and cancellation time when it is read, not
   stored, so it never goes stale when the end time passes (BB-1604).
8. RES-01: Pay on a bill that isn't Unpaid (TC-R01-04). Payment pending or Awaiting verification: "This bill
   already has a payment in progress" (the SRS wording from BM-04). Paid: "This bill is already paid." Carried
   forward: "This bill was carried forward to your newest bill. Pay that one instead." If the bill changes while the
   payment starts: "This bill changed while you were paying. Open Dues again."
9. RES-01: the reason shown on Dues after a payment ends without money (TC-R01-17) is the gateway's own reason. With
   none: "The payment did not go through. You can pay again." After the 30-minute re-check: "No payment arrived
   within 30 minutes. You can pay again."
10. RES-01: a confirmation for an Unpaid bill whose total was corrected after the payment started is flagged as an
    overpayment, like a late one on a settled bill, since a bill is never made Paid by a different amount (BR-06).
11. RES-01: the receipt number is `R-`, the bill's year and month, and the receipt's number, like `R-2611-0101`, as on
    the prototype's Dues screen. A receipt for a bill that isn't Paid: "This bill isn't paid yet, so it has no
    receipt." "Download receipt" opens the browser's print dialog, which can save a PDF, so no PDF library is added.
12. RES-01: the 30-minute re-check (BR-04) runs whenever a resident opens Dues, for every payment due in the building,
    because the free Vercel plan has no cron that runs every few minutes.


# Test cases: BM-09 and SG-05

## BM-09 — Plan guard shifts

| Test Case ID | Test Scenario | Expected Result |
|---|---|---|
| TC-BM09-01 | Given the building manager selects a guard, date, start time, and end time, when the manager saves the shift, then the shift is added to the duty list and the guard's Duty screen. | System saves the shift and displays it in both the manager's duty list and the assigned guard's Duty screen. |
| TC-BM09-02 | Given a guard already has a shift, when the building manager creates another shift that overlaps the existing shift and saves it, then the system refuses the operation. | System displays `This guard already has a shift then` and saves nothing. |
| TC-BM09-03 | Given there are hours in the next 7 days with no guard on duty, when the building manager opens the duty list, then those gaps are highlighted. | System highlights all duty coverage gaps within the next 7 days. |

## SG-05 — See my shift

| Test Case ID | Test Scenario | Expected Result |
|---|---|---|
| TC-SG05-01 | Given the building manager has assigned shifts to a guard, when the guard opens Duty, then the assigned shifts for the next 7 days are displayed. | System displays the date, start time, and end time of each assigned shift. |
| TC-SG05-02 | Given a guard has no shift today, when the guard opens Duty, then the system displays a message. | System displays `No shift today`. |
| TC-SG05-03 | Given a guard opens Duty, when the guard attempts to create a new shift, then the system prevents the action. | Guard cannot create shifts. |
| TC-SG05-04 | Given a guard opens Duty, when the guard attempts to edit an assigned shift, then the system prevents the action. | Guard cannot edit assigned shifts. |
| TC-SG05-05 | Given a guard opens Duty, when the guard attempts to swap an assigned shift, then the system prevents the action. | Guard cannot swap shifts. |
# Test cases: SG-04 and SG-07

## SG-04 — Record guest exit

| Test Case ID | Test Scenario | Expected Result |
|---|---|---|
| TC-SG04-01 | Given a pass has guests inside, when the guard enters how many guests are leaving and confirms, then the exit time, count, and guard account are saved. | System saves the exit time, number of guests leaving, and the authenticated guard account. |
| TC-SG04-02 | Given all guests on a pass have left, when the exit is saved, then the pass no longer appears in Visitors inside. | Pass is removed from the Visitors inside list after all guests have left. |
| TC-SG04-03 | Given a pass has nobody inside, when the guard tries to record an exit, then the system refuses the operation. | System displays `No guests from this pass are inside` and saves nothing. |

## SG-07 — See visitors inside

| Test Case ID | Test Scenario | Expected Result |
|---|---|---|
| TC-SG07-01 | Given guests have entered and not all have left, when the guard opens Visitors inside, then each pass is displayed with the required details. | System displays each pass with the guest name, flat, number of guests inside, and entry time. |
| TC-SG07-02 | Given a pass's end time has passed and guests from it are still inside, when the guard views Visitors inside, then the pass is highlighted. | System highlights the pass with the status `Overstayed`. |
| TC-SG07-03 | Given the guard opens an entry, when its details are displayed, then only gate details are shown and the resident's phone number is not displayed. | System displays gate details and never displays the resident's phone number. |
| TC-SG07-04 | Given walk-in visitors handled by intercom are not recorded in Release 1, when the guard opens Visitors inside, then the list contains pass guests only. | Walk-in visitors handled by intercom do not appear in the Visitors inside list. |
## SG-02 · Check a guest pass

| ID | Type | Case | Expected result | Source | Built in |
|---|---|---|---|---|---|
| TC-SG02-01 | Normal | Check a pass that is currently valid | Guest name, flat, approved guest count and remaining guest count are displayed; check-in is offered | SG-02, BR-11 | BB-1701 |
| TC-SG02-02 | Exception | Check an expired pass | "Pass not valid" with reason "Expired"; check-in is refused | SG-02 | BB-1701 |
| TC-SG02-03 | Exception | Check a cancelled pass | "Pass not valid" with reason "Cancelled"; check-in is refused | SG-02 | BB-1701 |
| TC-SG02-04 | Exception | Check a pass before its valid-from time | "Pass not valid" with the valid-from time; check-in is refused | SG-02 | BB-1701 |
| TC-SG02-05 | Exception | Check a code that matches no pass | "No pass with this code" is displayed | SG-02 | BB-1701 |
| TC-SG02-06 | Boundary | Check a fully used pass | "Fully used" is displayed; check-in is not offered | SG-02, RES-03 c3 | BB-1701 |
| TC-SG02-07 | Normal | Check any pass result | The resident's phone number is never displayed | SG-02 | BB-1701 |

## SG-03 · Record guest entry

| ID | Type | Case | Expected result | Source | Built in |
|---|---|---|---|---|---|
| TC-SG03-01 | Normal | Check in 2 guests against a valid pass with at least 2 remaining | Entry time, guest count and guard account are saved; pass usage is updated | SG-03 | BB-1701 |
| TC-SG03-02 | Boundary | Check in exactly the remaining guest count | Entry is saved; remaining allowance becomes zero and the pass becomes Fully used | SG-03, RES-03 c3 | BB-1701 |
| TC-SG03-03 | Invalid | Enter more guests than remain on the pass | Check-in is refused; no entry is saved; the number of remaining guests is displayed | SG-03 | BB-1701 |
| TC-SG03-04 | Exception | Try to check a pass or confirm an entry while the device cannot reach the server | Within 5 seconds, "No connection: use the intercom and paper register" is displayed; nothing is shown as saved | SG-03 | BB-1701 |
| TC-SG03-05 | Normal | Restore connection and enter a visit from the paper register using its actual entry time | Visit is saved with the actual entry time and marked "Entered later" | SG-03 | BB-1701 |
| TC-SG03-06 | Normal | A guest entry is successfully saved | The resident receives a notification containing the number of guests who arrived | SG-03, RES-03 c5, NFR-29 | BB-1701, Feature 23 |

## MNT-01 · View assigned tickets
| ID | Type | Case | Expected result | Source | Built in |
|---|---|---|---|---|---|
| TC-MNT01-01 | Normal | Open the assigned tickets list using an active Maintenance Staff account | Only tickets assigned to the logged-in staff member are displayed | MNT-01 | BB-1401 |
| TC-MNT01-02 | Normal | View an assigned ticket in the list | Ticket title, short description, location, priority and current status are displayed | MNT-01 | BB-1401 |
| TC-MNT01-03 | Boundary | Open the assigned tickets list when no tickets are assigned | "No tickets assigned to you" is displayed | MNT-01 | BB-1401 |
| TC-MNT01-04 | Exception | Try to open a ticket assigned to another staff member | Access is refused; the other staff member's ticket details are not displayed | MNT-01, NFR-MNT-02 | BB-1401 |
## MNT-02 · View ticket details

| ID | Type | Case | Expected result | Source | Built in |
|---|---|---|---|---|---|
| TC-MNT02-01 | Normal | Open the details of an assigned ticket | Ticket description, location, category, priority and current status are displayed | MNT-02 | BB-1401 |
| TC-MNT02-02 | Normal | Open an assigned ticket that contains repair instructions or additional information | Available repair instructions and additional information are displayed | MNT-02 | BB-1401 |
| TC-MNT02-03 | Exception | Open a ticket that does not exist | A clear error message is displayed; no ticket details are shown | MNT-02 | BB-1401 |
| TC-MNT02-04 | Exception | Try to view a ticket that is not assigned to the logged-in staff member | Access is refused; the ticket details are not displayed | MNT-02, NFR-MNT-02 | BB-1401 |

## MNT-03 · Update ticket status

| ID | Type | Case | Expected result | Source | Built in |
|---|---|---|---|---|---|
| TC-MNT03-01 | Normal | Start working on an assigned ticket | Ticket status changes to "In progress" after successful save | MNT-03 | BB-1401 |
| TC-MNT03-02 | Normal | Mark an assigned In progress ticket as Fixed after completing the repair | Ticket status changes to "Fixed" after successful save | MNT-03 | BB-1401 |
| TC-MNT03-03 | Normal | Reopen an assigned ticket after updating its status | The latest successfully saved status is displayed | MNT-03, NFR-MNT-03 | BB-1401 |
| TC-MNT03-04 | Exception | Try to update the status of a ticket assigned to another staff member | Access is refused; the ticket status remains unchanged | MNT-03, NFR-MNT-02 | BB-1401 |
| TC-MNT03-05 | Invalid | Try to change a Fixed ticket to Closed as Maintenance Staff | The status update is refused; only the Building Manager can close the ticket | MNT-03 | BB-1401 |
| TC-MNT03-06 | Exception | Update a ticket status when saving fails | An error message is displayed; the unsaved status is not shown as successfully updated | MNT-03, NFR-MNT-03 | BB-1401 |

## MNT-04 · Record work notes

| ID | Type | Case | Expected result | Source | Built in |
|---|---|---|---|---|---|
| TC-MNT04-01 | Normal | Enter a non-empty work note for an assigned ticket and save it | The work note is saved and associated with the ticket | MNT-04 | BB-1401 |
| TC-MNT04-02 | Normal | Save a work note successfully | "Note saved" confirmation is displayed | MNT-04 | BB-1401 |
| TC-MNT04-03 | Invalid | Try to save an empty work note | "Write a note" is displayed; no empty note is saved | MNT-04 | BB-1401 |
| TC-MNT04-04 | Normal | Reopen a ticket after saving a work note | The previously saved work note is displayed | MNT-04 | BB-1401 |
| TC-MNT04-05 | Normal | Building Manager views a ticket with a saved work note | The saved work note is visible to the Building Manager | MNT-04 | BB-1401 |
| TC-MNT04-06 | Exception | Save a work note when the save operation fails | An error message is displayed; the note is not shown as successfully saved | MNT-04 | BB-1401 |
## MNT-05 � Report an extra problem

| ID | Type | Case | Expected result | Source | Built in |
|---|---|---|---|---|---|
| TC-MNT05-01 | Normal | While working on an assigned ticket, submit a new problem with a category, description and place | A new ticket is created as "Reported", marked "Found by staff", linked to the original ticket, and the manager is notified | MNT-05 | BB-1501 |
| TC-MNT05-02 | Normal | Open the Tickets list as the Building Manager after a maintenance staff member reports an extra problem | The new ticket appears with its description and place and can be assigned like any other ticket | MNT-05, BM-06 | BB-1501 |
| TC-MNT05-03 | Boundary | Submit an extra problem with the minimum non-empty values accepted by the fields | The report is accepted and a new ticket is created with the submitted information | MNT-05 | BB-1501 |
| TC-MNT05-04 | Invalid | Submit an extra problem with the category empty | The missing category is identified; no new ticket is saved | MNT-05 | BB-1501 |
| TC-MNT05-05 | Invalid | Submit an extra problem with the description empty | The missing description is identified; no new ticket is saved | MNT-05 | BB-1501 |
| TC-MNT05-06 | Invalid | Submit an extra problem with the place empty | The missing place is identified; no new ticket is saved | MNT-05 | BB-1501 |
| TC-MNT05-07 | Exception | Try to report an extra problem from a ticket assigned to another staff member | Access is refused; no new ticket is created | MNT-05, NFR-MNT-02 | BB-1501 |
| TC-MNT05-08 | Exception | Submit an extra problem when the save operation fails | An error is displayed; the report is not shown as successfully created | MNT-05 | BB-1501 |
## BM-10 - Keep emergency numbers up to date

| ID | Type | Case | Expected result | Source | Built in |
|---|---|---|---|---|---|
| TC-BM10-01 | Normal | Enter valid guard-desk and manager emergency numbers and save | Both numbers are saved successfully | BM-10 | BB-2001 |
| TC-BM10-02 | Normal | Open or refresh the emergency screen after the manager changes a number | Every user sees the newly saved emergency numbers | BM-10, SG-06 | BB-2001 |
| TC-BM10-03 | Boundary | Save valid Bangladeshi phone numbers containing 9 digits and 11 digits | Both numbers are accepted and saved | BM-10, BR-12 | BB-2001 |
| TC-BM10-04 | Invalid | Leave the guard-desk number empty and save | "Enter a valid phone number" is displayed; nothing is saved | BM-10, BR-12 | BB-2001 |
| TC-BM10-05 | Invalid | Leave the manager number empty and save | "Enter a valid phone number" is displayed; nothing is saved | BM-10, BR-12 | BB-2001 |
| TC-BM10-06 | Invalid | Enter a phone number with fewer than 9 or more than 11 digits and save | "Enter a valid phone number" is displayed; nothing is saved | BM-10, BR-12 | BB-2001 |
| TC-BM10-07 | Invalid | Try to edit or remove the 999 emergency number | 999 remains unchanged, first in the emergency list, and cannot be edited or removed | BM-10, BR-12 | BB-2001 |
| TC-BM10-08 | Exception | Save changed emergency numbers when the connection or server operation fails | An error is displayed within 5 seconds; the changes are not shown as saved | BM-10, NFR-17 | BB-2001 |

## SG-06 - Open emergency numbers

| ID | Type | Case | Expected result | Source | Built in |
|---|---|---|---|---|---|
| TC-SG06-01 | Normal | Open Emergency from a guard screen | Emergency numbers appear within 2 taps, with 999 first, followed by guard-desk and manager numbers; each has a Call button | SG-06, BR-12, NFR-16 | BB-2001 |
| TC-SG06-02 | Normal | Open or refresh the Emergency screen after the manager changes a number | The updated building number is displayed | SG-06, BM-10 | BB-2001 |
| TC-SG06-03 | Exception | Open Emergency on the gate device after its internet connection is lost | 999 and the last loaded building numbers remain visible and can be called | SG-06 | BB-2001 |

# Test cases: CM-01

Test cases for feature 4 (Charge rates and rate history), written from CM-01's confirmation criteria and the business rules and NFRs it cites in [SRS.md](srs/SRS.md). Same columns and types as the RES tables above. Amounts are ৳ in the Case column; the service and the database keep them in whole poisha.

## CM-01 · Set building charge rates

| ID | Type | Case | Expected result | Source | Built in |
|---|---|---|---|---|---|
| TC-C01-01 | Normal | Enter a new service charge of ৳3,800 and the meeting date 13 Nov 2026, then save | The new rate is saved as Current; the old service rate becomes Replaced; the new rate is used for bills made after the save | CM-01 c1 | BB-0404, BB-0407 |
| TC-C01-02 | Normal | Set a rate for service, then generator, then water | Each charge keeps exactly one Current rate; setting one does not change the others | CM-01 c1 | BB-0404 |
| TC-C01-03 | Normal | Set the first rate ever for a charge | Saved as Current; there is no old value; the history shows it with no "from" value | CM-01 c1, c5 | BB-0404, BB-0405 |
| TC-C01-04 | Boundary | Enter a rate of ৳0 | Saved; the SRS refuses only a blank or negative rate | CM-01 c4 | BB-0404 |
| TC-C01-05 | Boundary | Enter the smallest amount, ৳0.01 (1 poisha) | Saved as 1 poisha | CM-01 c1, BR-01 | BB-0404 |
| TC-C01-06 | Invalid | Leave the rate blank | "Enter a valid rate and meeting date"; the rate and the history do not change | CM-01 c4 | BB-0404, BB-0407 |
| TC-C01-07 | Invalid | Enter a negative rate (for example ৳-1) | "Enter a valid rate and meeting date"; nothing changes | CM-01 c4 | BB-0404 |
| TC-C01-08 | Invalid | Enter an amount that is not whole poisha (for example 1.5 poisha) | "Enter a valid rate and meeting date"; nothing changes | CM-01 c4, BR-01 | BB-0404 |
| TC-C01-09 | Invalid | Leave out the meeting date | "Enter a valid rate and meeting date"; nothing changes | CM-01 c4 | BB-0404, BB-0407 |
| TC-C01-10 | Invalid | A meeting date that is not a real date (30 Feb 2026) or not written as a date | "Enter a valid rate and meeting date"; nothing changes | CM-01 c4 | BB-0404 |
| TC-C01-11 | Invalid | A charge type that is not service, generator or water | "Enter a valid rate and meeting date"; nothing changes | CM-01 c1 | BB-0404, BB-0406 |
| TC-C01-12 | Normal | Save a rate | One audit log entry (`chargeRate.set`) with the committee member, the time, the old values and the new values | R-12, NFR-27 | BB-0404 |
| TC-C01-13 | Invalid | Save a refused rate (any of TC-C01-06 to TC-C01-11) | No audit log entry is written; the earlier rate is still Current | CM-01 c4, NFR-27 | BB-0404 |
| TC-C01-14 | Exception | The database fails while saving the rate | An error is shown and the change is never shown as saved; no audit entry; the old rate stays Current | NFR-17 | BB-0404, BB-0406 |
| TC-C01-15 | Normal | The manager runs a month's bills after a new rate was saved | The bill lines use the new rate | CM-01 c1 | BB-0505 (feature 5, Nishi) |
| TC-C01-16 | Normal | Change a rate after a month's bills already exist | Those bills keep their old rates; only later bill runs use the new one | CM-01 c2, BR-07 | BB-0505 (feature 5, Nishi) |
| TC-C01-17 | Exception | Save a new rate while a bill run is in progress | The run finishes with the rates it started with; the new rate applies from the next run | CM-01 c3 | BB-0505 (feature 5, Nishi) |
| TC-C01-18 | Normal | Open Rate history after a rate changed | Each change shows who changed it, when, the meeting date, and the old and new values | CM-01 c5 | BB-0405, BB-0407 |
| TC-C01-19 | Normal | Change service twice and water once, then open Rate history | All three changes show, newest first; each charge's old value is the rate before it | CM-01 c5 | BB-0405 |
| TC-C01-20 | Boundary | Open Rate history before any rate was set | An empty list ("No rate changes yet."), no error | CM-01 c5 | BB-0405, BB-0407 |
| TC-C01-21 | Normal | Open Rates | The Current rates show in the order service, generator, water, each as "Now ৳... per flat" | CM-01 c1 | BB-0405, BB-0407 |
| TC-C01-22 | Exception | Resident, guard, manager, maintenance or admin calls the set-rate or rate-history route; or nobody is signed in | 403 for each other role; 401 when signed out; nothing is read or saved | NFR-06 | BB-0406 |
| TC-C01-23 | Exception | A committee member who has not yet replaced the temporary password calls the route | 403 "Choose your own password before continuing." | BR-15, NFR-06 | BB-0406 |
| TC-C01-24 | Normal | Save succeeds on the page | A success message shows and the history gets a new row | CM-01 c1, c5 | BB-0407 |
| TC-C01-25 | Normal | Open Rates at 360 px and at 1280 px | No sideways scrolling; inputs and the Save button are at least 48 px tall | NFR-23 | BB-0407 |

## Open questions for CM-01

1. Can the meeting date be in the future? The SRS only says a meeting date is required, so our service accepts any real date.
2. Should the manager see Rate history too? CM-01 says "any member" (committee), so only the committee has the `viewRateHistory` row for now.


# Test cases: BM-08 and CM-02

Test cases for feature 9 (Record expenses, approve or reject them), written from the confirmation criteria of BM-08 and CM-02 and the business rules and NFRs they cite in [SRS.md](srs/SRS.md). Same columns and types as the RES tables above. Amounts are ৳ in the Case column; the service and the database keep them in whole poisha.

## BM-08 · Record building expenses

| ID | Type | Case | Expected result | Source | Built in |
|---|---|---|---|---|---|
| TC-BM08-01 | Normal | Enter amount ৳2,500, today's date, category repair, a description and no receipt photo, then save | Expense saved as Waiting for approval, recorded by the manager | BM-08 c1 | BB-0904 |
| TC-BM08-02 | Normal | Save an expense with a receipt photo | Saved as Waiting for approval; the photo is kept with it | BM-08 c1 | BB-0904, BB-0906 |
| TC-BM08-03 | Normal | Record one expense in each category: repair, salary, utility, other | All four are saved | BM-08 c1 | BB-0904 |
| TC-BM08-04 | Normal | Save an expense | One audit log entry (`expense.record`) with the manager, the time and the new values | NFR-27 | BB-0904 |
| TC-BM08-05 | Boundary | Expense date is today (Dhaka date) | Saved | BM-08 c2, BR-01 | BB-0904 |
| TC-BM08-06 | Boundary | It is 00:30 on the 24th in Dhaka (still the 23rd in UTC) and the date is the 24th | Saved; the Dhaka date is used, not the UTC date | BR-01 | BB-0904 |
| TC-BM08-07 | Invalid | Expense date is tomorrow | "Check the expense date"; nothing saved; no audit entry | BM-08 c2 | BB-0904 |
| TC-BM08-08 | Invalid | Expense date is missing, not a date, or does not exist (30 Feb 2026) | "Check the expense date"; nothing saved | BM-08 c2 | BB-0904 |
| TC-BM08-09 | Invalid | Amount is blank, ৳0, negative, or not whole poisha | Refused (400); nothing saved | BM-08 c1 | BB-0904 |
| TC-BM08-10 | Invalid | Category missing, or description empty or only spaces | Refused (400); nothing saved | BM-08 c1 | BB-0904 |
| TC-BM08-11 | Invalid | Receipt photo over 5 MB, or not JPG or PNG | Refused with a message; nothing saved | NFR-09 | BB-0906 |
| TC-BM08-12 | Normal | Edit an expense that is Waiting for approval and give a note | The change is saved with the note; still Waiting for approval; audit entry shows old and new values | BM-08 c3, NFR-27 | BB-0904 |
| TC-BM08-13 | Invalid | Edit a waiting expense with no note | Refused (400); nothing changes | BM-08 c3 | BB-0904 |
| TC-BM08-14 | Invalid | Edit a waiting expense and set a future date | "Check the expense date"; nothing changes | BM-08 c2 | BB-0904 |
| TC-BM08-15 | Normal | Open an expense the committee rejected | The manager sees the committee's reason | BM-08 c4, CM-02 c2 | BB-0904, BB-0908 |
| TC-BM08-16 | Normal | Resubmit a Rejected expense with corrected details | Back to Waiting for approval; the earlier decision is cleared from the row but stays in the audit log | BM-08 c4 | BB-0904 |
| TC-BM08-17 | Exception | Resubmit an expense that is Waiting for approval or Approved | Refused (409); nothing changes | BM-08 c4 | BB-0904 |
| TC-BM08-18 | Exception | Edit a Rejected expense instead of resubmitting it | Refused (409); the manager must resubmit | BM-08 c4 | BB-0904 |
| TC-BM08-19 | Exception | Edit an Approved expense | Refused (409) with a message to add a correcting expense; there is no delete | BM-08 c5, CM-02 c4 | BB-0904 |
| TC-BM08-20 | Normal | Add a correcting expense of -৳500 to an Approved expense | New expense linked to the original, Waiting for approval; the original is unchanged | BM-08 c5 | BB-0904 |
| TC-BM08-21 | Normal | Add a positive correcting expense | Saved, linked, Waiting for approval | BM-08 c5 | BB-0904 |
| TC-BM08-22 | Boundary | Add a correcting expense of ৳0 | Refused (400) | BM-08 c5 | BB-0904 |
| TC-BM08-23 | Exception | Add a correcting expense to an expense that is not Approved, or does not exist | Refused (409 or 404) | BM-08 c5 | BB-0904 |
| TC-BM08-24 | Exception | Edit a correcting expense while it is waiting | Allowed with a note; a negative amount stays allowed | BM-08 c3, c5 | BB-0904 |
| TC-BM08-25 | Normal | Open the list of expenses | Every expense, newest first, with its status | BM-08 | BB-0904, BB-0906, BB-0907 |
| TC-BM08-26 | Exception | Anyone other than the manager calls record, edit, resubmit or correct; or nobody is signed in | 403 for other roles; 401 when signed out | NFR-06 | BB-0906 |
| TC-BM08-27 | Exception | The database fails while saving | An error is shown; nothing is shown as saved; no audit entry | NFR-17 | BB-0904, BB-0906 |

## CM-02 · Approve or reject building expenses

| ID | Type | Case | Expected result | Source | Built in |
|---|---|---|---|---|---|
| TC-C02-01 | Normal | Approve an expense that is Waiting for approval | Becomes Approved; who and when are saved; it counts in the fund summary | CM-02 c1, BR-10 | BB-0905 |
| TC-C02-02 | Normal | Approve a correcting expense | Becomes Approved, like any other | CM-02 c1, BM-08 c5 | BB-0905 |
| TC-C02-03 | Normal | Approve an expense | One audit log entry (`expense.approve`) with old and new values | NFR-27 | BB-0905 |
| TC-C02-04 | Normal | Reject a waiting expense with the reason "No receipt attached" | Becomes Rejected; the reason, who and when are saved; it does not count in the fund summary | CM-02 c2, BR-10 | BB-0905 |
| TC-C02-05 | Normal | Reject an expense | One audit log entry (`expense.reject`) with the reason | NFR-27 | BB-0905 |
| TC-C02-06 | Invalid | Reject with no reason, or only spaces | "Write a reason"; status does not change; no audit entry | CM-02 c2 | BB-0905 |
| TC-C02-07 | Boundary | Reject with a reason that has spaces around it | The reason is saved trimmed | CM-02 c2 | BB-0905 |
| TC-C02-08 | Exception | Approve or reject an expense that is already Approved | Refused (409) with "This expense is already Approved."; nothing changes | CM-02 c3 | BB-0905 |
| TC-C02-09 | Exception | Approve or reject an expense that is already Rejected | Refused (409) with "This expense is already Rejected."; nothing changes | CM-02 c3 | BB-0905 |
| TC-C02-10 | Exception | Approve or reject an expense that does not exist | 404; nothing changes | CM-02 | BB-0905 |
| TC-C02-11 | Exception | Try to change the amount of an Approved expense, or delete it | Refused; the member is told to ask the manager for a correcting expense | CM-02 c4, BM-08 c5 | BB-0904, BB-0905 |
| TC-C02-12 | Normal | The manager resubmits after a rejection, then the committee decides again | The expense can be approved or rejected again; each decision is in the audit log | BM-08 c4, CM-02 | BB-0904, BB-0905 |
| TC-C02-13 | Normal | Open the approval screen | The committee sees expenses with the amount, date, category, description and receipt photo | CM-02 | BB-0906, BB-0908 |
| TC-C02-14 | Normal | From Home, approve an expense | At most 4 taps | NFR-24 | BB-0908 |
| TC-C02-15 | Exception | Anyone other than a committee member calls approve or reject; or nobody is signed in | 403 for other roles (the manager cannot approve); 401 when signed out | NFR-06 | BB-0906 |
| TC-C02-16 | Exception | The database fails while saving a decision | An error is shown; the status is not shown as changed; no audit entry | NFR-17 | BB-0905, BB-0906 |
| TC-C02-17 | Normal | The manager enters the first month's opening balance and the committee approves it | The first summary can be published | CM-02 c5 | BB-1003 (feature 10) |
| TC-C02-18 | Normal | The committee rejects the opening balance with a reason | The manager sees the reason and can enter a corrected figure that comes back for approval | CM-02 c6 | BB-1003 (feature 10) |
| TC-C02-19 | Invalid | Reject the opening balance with no reason | "Write a reason"; nothing changes | CM-02 c6 | BB-1003 (feature 10) |

## Open questions for BM-08 and CM-02

1. The SRS gives wording only for "Check the expense date" and "Write a reason". Our messages for a missing amount, category or description, for an edit with no note, and for "This expense is already Approved." are our own and need the team's approval.
2. Is the note on an edit required? BM-08 says the change is "saved with a note", so we require it.


# Test cases: BM-12 and RES-05

Test cases for feature 10 (Monthly fund summary, with the opening balance), written from the confirmation criteria of BM-12 and RES-05 and the business rules and NFRs they cite in [SRS.md](srs/SRS.md). Same columns and types as the RES tables above. Amounts are ৳ in the Case column; the service and the database keep them in whole poisha.

## BM-12 · Publish the monthly fund summary

| ID | Type | Case | Expected result | Source | Built in |
|---|---|---|---|---|---|
| TC-BM12-01 | Normal | Publish the summary of a month that has ended | Shows the opening balance, total collected, total spent by category (repair, salary, utility, other), the closing balance and the total outstanding | BM-12 c1, BR-10 | BB-1004, BB-1005 |
| TC-BM12-02 | Normal | Check the closing balance | Closing balance = opening balance + total collected - total spent | BR-10, NFR-26 | BB-1004 |
| TC-BM12-03 | Normal | Check total collected | Counts only payments confirmed in that month (by the date they were confirmed), each exactly once | BR-10, NFR-26 | BB-1004 |
| TC-BM12-04 | Normal | Check total spent | Counts expenses by their expense date, and only Approved ones; a negative correcting expense reduces the total | BR-10, BM-08 c5 | BB-1004 |
| TC-BM12-05 | Normal | A month has expenses that are Waiting for approval or Rejected | They are left out of total spent | BM-12 c4, BR-10 | BB-1004 |
| TC-BM12-06 | Normal | Check total outstanding | Equals the sum of the saved bills that are still unpaid, to the poisha | BM-12 c1, NFR-26 | BB-1004 |
| TC-BM12-07 | Normal | Open the next month's summary | Its opening balance equals the previous month's closing balance | BR-10 | BB-1004 |
| TC-BM12-08 | Boundary | A month with no payments and no expenses | Collected and spent are ৳0.00; closing balance equals opening balance | BR-10 | BB-1004 |
| TC-BM12-09 | Boundary | Publish on the last day of the month, and on the first day of the next month | Refused on the last day; allowed from the first day of the next month (Dhaka date) | BM-12 c2, BR-01 | BB-1005 |
| TC-BM12-10 | Invalid | Publish a month that has not ended | "You can publish once the month has ended"; nothing is published | BM-12 c2 | BB-1005 |
| TC-BM12-11 | Exception | Publish a month that is already Published | Refused (409); nothing changes | State diagram | BB-1005 |
| TC-BM12-12 | Normal | First month in the system: enter an opening balance | The balance is saved as Waiting for approval; the summary cannot be published yet | BM-12 c3 | BB-1003, BB-1005 |
| TC-BM12-13 | Exception | Publish the first month's summary before the committee approves the opening balance | Refused; nothing is published | BM-12 c3 | BB-1005 |
| TC-BM12-14 | Normal | The committee approves the opening balance | The manager can now publish the first summary | BM-12 c3, CM-02 c5 | BB-1003, BB-1005 |
| TC-BM12-15 | Normal | The committee rejects the opening balance with a reason | The manager sees the reason, enters a corrected balance, and it goes back to Waiting for approval | BM-12 c3, CM-02 c6 | BB-1003 |
| TC-BM12-16 | Invalid | Enter an opening balance that is blank or not a number | Refused (400); nothing saved | BM-12 c3 | BB-1003 |
| TC-BM12-17 | Exception | Enter or change an opening balance that is already Approved | Refused (409); Approved is final | State diagram | BB-1003 |
| TC-BM12-18 | Normal | Enter, approve or reject an opening balance | One audit log entry each, with the account, the time and the values | NFR-27 | BB-1003 |
| TC-BM12-19 | Normal | An expense dated in a published month is approved later | That month's summary is updated and marked Revised; later months' balances change with it | BM-12 c5, BR-10 | Not built: left out unless there is time |
| TC-BM12-20 | Normal | Send the summary as an announcement | The committee can read it there and in their email | BM-12 c6, BM-11 | Not built: left out unless there is time |
| TC-BM12-21 | Exception | Anyone other than the manager calls publish or opening-balance entry; or nobody is signed in | 403 for other roles; 401 when signed out | NFR-06 | BB-1006 |
| TC-BM12-22 | Exception | Anyone other than a committee member approves or rejects the opening balance | 403 (the manager cannot approve) | NFR-06, CM-02 | BB-1006 |
| TC-BM12-23 | Exception | The database fails while publishing | An error is shown; the summary is not shown as published; no audit entry | NFR-17 | BB-1005, BB-1006 |
| TC-BM12-24 | Normal | Open Fund for the manager at 360 px and at 1280 px | No sideways scrolling; the opening balance form works | NFR-23 | BB-1007 |

## RES-05 · See how the building fund is spent

| ID | Type | Case | Expected result | Source | Built in |
|---|---|---|---|---|---|
| TC-R05-01 | Normal | Open Fund summary after the manager published a month | Shows the opening balance, total collected, total spent by category, the closing balance and the total outstanding | RES-05 c1, BR-10 | BB-1008 |
| TC-R05-02 | Normal | An expense is Waiting for approval or Rejected | It is not counted in the summary | RES-05 c2, BR-10 | BB-1004, BB-1008 |
| TC-R05-03 | Normal | This month's summary is not published yet | Shows the last published month and a note that this month is not ready | RES-05 c3 | BB-1006, BB-1008 |
| TC-R05-04 | Boundary | No month has been published yet | A clear "not ready" message, no error and no empty table | RES-05 c3 | BB-1008 |
| TC-R05-05 | Exception | A Draft summary is requested by a resident | Not shown; only Published summaries are visible | RES-05 c3 | BB-1006 |
| TC-R05-06 | Normal | A resident opens the summary | Totals only; no flat names, no list of who owes money | NFR-12 | BB-1006, BB-1008 |
| TC-R05-07 | Normal | Resident and committee member open the same month | Both see the same figures | CM-04 c1 | BB-1006, BB-1008 |
| TC-R05-08 | Normal | A new household in the same flat opens the summary | It sees the same building totals; the summary is not household data | BR-09 | BB-1006 |
| TC-R05-09 | Exception | Guard, maintenance or admin calls the fund summary route; or nobody is signed in | 403 for those roles; 401 when signed out. Resident, manager and committee may view | NFR-06 | BB-1006 |
| TC-R05-10 | Normal | Open Fund summary with data for 200 flats on a throttled Fast 3G connection | Loads within 3 s for 95% of requests | NFR-01 | BB-1008 |
| TC-R05-11 | Normal | Open Fund summary at 360 px and at 1280 px | No sideways scrolling; readable at 150% text size | NFR-23 | BB-1008 |

## Open questions for BM-12 and RES-05

1. "Total outstanding" has no exact definition in the SRS. We take it as the sum of bills that are still unpaid; the team should confirm whether bills in Awaiting verification or Payment pending count.
2. Which month counts as "the first month in the system"? We take the first month that has a bill or an expense.
3. The wording for the messages "Not published yet" (CM-04) and the "this month isn't ready" note (RES-05) is not fixed in the SRS.
