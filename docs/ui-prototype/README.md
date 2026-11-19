# BariBondhu UI prototype

A clickable prototype of every key screen in Release 1, kept in line with SRS v1.5 and the SDS. It is plain HTML, CSS and a little
JavaScript, with no build step.

## Opening it

Open `index.html` in a browser (double-click it). The first page shows the design system (colours, type, status
badges, components) and links to every screen in both views. Each screen has a bar at the top with **← All screens**.

Screens load the Inter and Hind Siliguri fonts from Google Fonts. Without internet, Bangla text falls back to the
system font.

## Phone and web views

BariBondhu is a responsive web app (SRS section 2: residents and staff use phones, the manager also uses a laptop,
the guard may use a tablet). So every screen comes in two views, and both are the reference for the real app:

| Screen group | Phone view | Web view |
|---|---|---|
| Shared, Resident, Guard, Committee, Maintenance | `X.html` (the original design) | `X-Web.html`: side menu with the role's sections, desk bar, wider page |
| Manager, Administrator | `X-Mobile.html`: bottom menu (Home, Claims, Tickets, More), tables shown as one card per row | `X.html` (the original design) |

- **View: Phone · Web** in the bar at the top of every screen switches to the same screen in the other view.
- Links inside a view stay in that view, so a whole journey can be clicked through as phone or as web.
- On the phone, the manager's other sections are under **More** (`M-More-Mobile.html`), which has no web
  counterpart because the web view shows them in the side menu.
- Phone views fit 360 px with no sideways scrolling and keep 48 px tap targets (NFR-23). Shared styles for both
  views are in `views.css`.

## What you can do

- Tap through the flows. Links follow the real journeys, for example Home → Pay → Receipt, or a guest pass code →
  Pass valid → Record entry.
- **Show tap targets** (top-right checkbox) draws a red outline round everything you can tap. Turn it off for clean
  screenshots; the browser remembers the choice.
- Some screens have extra controls in the top bar to show other states:

  | Screen | Control |
  |---|---|
  | `S-Login.html` | State: Log in, Too many wrong passwords, Forgot password (link sent, or no email) |
  | `R-Dues.html` | Bill state: Unpaid, Payment pending, Awaiting verification, Claim rejected |
  | `R-ReportFault.html` | Start in: Inside my flat or Common area (the switch on the screen works too) |
  | `G-Home.html` | Offline banner |
  | `G-Pass-Invalid.html` | Reason: Expired, Cancelled, Not yet valid, No pass with this code, Fully used |
  | `C-Expense.html` | Item: an expense, or the first month's opening balance |
  | `M-Accounts.html` | Show: Households, or Staff and committee (the switch on the screen works too) |
  | `M-Fund.html` | Month: a normal month, or the first month with its opening balance waiting for approval or rejected |

- Working parts: Forgot password on the log-in screen, the guard keypad (type 6 digits; `111111` shows "Pass not
  valid"), the guest-count steppers, the feedback stars, the maintenance status buttons, and the committee's Approve
  and Reject (for expenses and the opening balance).

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
| `M-*.html` | Building manager (laptop) |
| `A-*.html` | System administrator (laptop) |
| `*-Web.html`, `*-Mobile.html` | The other view of each screen (see "Phone and web views") |
| `bb.css` | Colours and components, which become the shadcn/Tailwind theme in the real app |
| `views.css` | Layout of the web views of phone screens and the phone views of laptop screens |
| `proto.css`, `hotspots.js`, `proto.js` | Prototype frame, tap-target outlines, and the small runtime for interactive screens |

## Known gaps

- The language button switches to Bangla only on the Resident home screen; elsewhere it stays on the same page.
- Maintenance screens are in English here, though the SRS says maintenance staff prefer Bangla.
- The emergency screen's back arrow always returns to the Resident home.
