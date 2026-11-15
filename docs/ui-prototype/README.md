# BariBondhu UI prototype

A clickable prototype of every key screen in Release 1, built from SRS v1.3. It is plain HTML, CSS and a little
JavaScript, with no build step.

## Opening it

Open `index.html` in a browser (double-click it). The first page shows the design system (colours, type, status
badges, components) and links to every screen. Each screen has a bar at the top with **← All screens**.

Screens load the Inter and Hind Siliguri fonts from Google Fonts. Without internet, Bangla text falls back to the
system font.

## What you can do

- Tap through the flows. Links follow the real journeys, for example Home → Pay → Receipt, or a guest pass code →
  Pass valid → Record entry.
- **Show tap targets** (top-right checkbox) draws a red outline round everything you can tap. Turn it off for clean
  screenshots; the browser remembers the choice.
- Some screens have extra controls in the top bar to show other states:

  | Screen | Control |
  |---|---|
  | `R-Dues.html` | Bill state: Unpaid, Payment pending, Awaiting verification, Claim rejected |
  | `R-ReportFault.html` | Start in: Inside my flat or Common area (the switch on the screen works too) |
  | `G-Home.html` | Offline banner |
  | `G-Pass-Invalid.html` | Reason: Expired, Cancelled, Not yet valid, No pass with this code, Fully used |

- Working parts: the guard keypad (type 6 digits; `111111` shows "Pass not valid"), the guest-count steppers, the
  feedback stars, the maintenance status buttons, and the committee's Approve and Reject.

All names, flats and amounts are sample data.

## Files

| File | What it is |
|---|---|
| `index.html` | Design system and screen index |
| `S-*.html` | Shared: log in, emergency numbers |
| `R-*.html` | Resident (phone) |
| `G-*.html` | Security guard (gate phone, Bangla first) |
| `C-*.html` | Committee member (phone) |
| `T-*.html` | Maintenance staff (phone) |
| `M-*.html` | Building manager (laptop; stacks at phone width) |
| `A-*.html` | System administrator (laptop) |
| `bb.css` | Colours and components, which become the shadcn/Tailwind theme in the real app |
| `proto.css`, `hotspots.js`, `proto.js` | Prototype frame, tap-target outlines, and the small runtime for interactive screens |

## Known gaps

- The language button switches to Bangla only on the Resident home screen; elsewhere it stays on the same page.
- Maintenance screens are in English here, though the SRS says maintenance staff prefer Bangla.
- The emergency screen's back arrow always returns to the Resident home.
