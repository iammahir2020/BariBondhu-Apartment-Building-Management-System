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

## Open questions

The SRS gives no exact wording for these, so they need a decision before the service tickets (put the answer here and
in the test):

1. RES-02: is the short title required for a resident's report, and what does the error say?
2. RES-02: the message for a photo that is too big or the wrong type (NFR-09).
3. RES-03: the message for a guest count outside 1 to 20, and for an empty guest name.
4. RES-03: a pass whose start time has already passed but whose end time hasn't. The tables above allow it (it
   starts as Active), since c2 only refuses an end time that is past.


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