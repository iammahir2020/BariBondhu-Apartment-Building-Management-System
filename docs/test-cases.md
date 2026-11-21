# Test cases: RES-01, RES-02 and RES-03

The test cases for Mahir's three features, written from each story's confirmation criteria and the business rules and
NFRs it cites in [SRS.md](srs/SRS.md). Each case becomes one or more Jest tests in the ticket named in **Built in**,
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
