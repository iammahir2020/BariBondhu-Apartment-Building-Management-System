# Software Design Specification (SDS)

**BariBondhu: Apartment Building Management System**

Release 1 · CSE 451 Software Engineering, Autumn 2026 · Independent University, Bangladesh

This document describes the design of Release 1 as specified in the [SRS](../srs/SRS.md) (version 1.5). It holds the
four analysis models the course asks for: UML use case diagrams, use case narratives, state diagrams and a data flow
diagram. There is one part for each user class, including the System Administrator, and one data flow diagram for
the whole system.
Story IDs (RES, SG, BM, CM, MNT, ADM), business rules (BR) and non-functional requirements (NFR) refer to the SRS.

## Parts

| Part | Owner | Use cases | State diagrams |
|---|---|---|---|
| [Resident](resident/Resident_SDS.md) | Mahir Al Kamal | UC-R01 to UC-R17 | Bill, Guest pass, Payment claim, Household account |
| [Building Manager](building-manager/Building_Manager_SDS.md) | Jannatul Ferdus Nishi | UC-BM01 to UC-BM22 | Staff account, Announcement, Overpayment |
| [System Administrator](system-administrator/System_Administrator_SDS.md) | Mahir Al Kamal | UC-ADM01 to UC-ADM04 | (manager account: see Staff account) |
| [Committee Member](committee-member/Committee_Member_SDS.md) | Ayesha Siddiqa | UC-C01 to UC-C12 | Expense, Opening balance, Fund summary, Charge rate |
| [Security Guard](security-guard/Security_Guard_SDS.md) | Tawhid Moslim | UC-SG01 to UC-SG09 | Visit, Shift |
| [Maintenance Staff](maintenance-staff/Maintenance_Staff_SDS.md) | Adika Rahman | UC-MNT01 to UC-MNT08 | Fault ticket |
| [Data flow diagram](system/Data_Flow_Diagrams.md) | Mahir Al Kamal | Level 0 (context diagram) for the whole system | |

The states, use case relationships, data flows and entities that every part follows are listed in
[design-inputs-from-srs.md](design-inputs-from-srs.md).

## Notation

- **Use case diagrams** (UML): the primary actor is on the left and secondary actors on the right, outside the system
  boundary. Teal use cases are base use cases, and yellow ones extend another or are abstract (in italics). «include»
  arrows are orange and dashed; «extend» arrows are red and dashed, with their condition in brackets. A hollow
  triangle shows a use case that specialises an abstract one.
- **Use case narratives** follow the Lecture 3 table: use case, actors, precondition, trigger, main success scenario,
  alternate flows, postcondition and non-functional requirements. An alternate flow is numbered after the step it
  branches from, so 2a branches from step 2.
- **State diagrams** (UML): a filled circle starts the object's life and a ringed circle ends it. Red states and
  arrows are cancellations, rejections and removals. Each object has exactly one diagram, in the part of the class
  that moves it most, so no two diagrams can disagree.
- **Data flow diagram** (Gane-Sarson, Level 0): dark rectangles are external entities and the circle is the whole
  system as one process. Each arrow carries data one way.

All diagrams are `.drawio.svg` files under `diagrams/`. They show as images on GitHub and open for editing in draw.io
or the VS Code extension *Draw.io Integration*.

## Use case ID scheme

| Prefix | Class |
|---|---|
| UC-R | Resident |
| UC-BM | Building Manager |
| UC-ADM | System Administrator |
| UC-C | Committee Member |
| UC-SG | Security Guard |
| UC-MNT | Maintenance Staff |
