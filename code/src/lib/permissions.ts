/**
 * The role permissions table from `docs/sds/design-inputs-from-srs.md` ("Role permissions") as typed data, and the
 * checks every API route and role page makes against it (NFR-06). "Own" rows are limited to the user's own
 * occupancy (residents, BR-09, NFR-13) or own assigned work (maintenance staff, guards).
 *
 * These functions are pure, so tests can run every role against every action without a database. `auth.ts` reads
 * the session and calls them.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import { ROLES, type Role } from '@/lib/roles';

/** How far a role may go with an action: everything (`all`), or only its own occupancy or work (`own`). */
export type Scope = 'all' | 'own';

/** Which roles may do an action, and how far. A role left out may not do it. */
export type RoleScopes = Readonly<Partial<Record<Role, Scope>>>;

/**
 * One entry per row of the permissions table, in the same order. Add a row here (and in the design inputs) before
 * a route uses a new action. "Yes" and "View all" are `all`; "Own" is `own`.
 */
export const PERMISSIONS = {
  /** Set up the building; create or replace the manager account (ADM-01). */
  setUpBuilding: { admin: 'all' },
  /** Create and deactivate flat, guard, maintenance and committee accounts (BM-02). */
  manageAccounts: { manager: 'all' },
  /** End a household's occupancy (BM-02). */
  endOccupancy: { manager: 'all' },
  /** Set charge rates (CM-01). */
  setChargeRates: { committee: 'all' },
  /** See the current charge rates and the rate history (CM-01). */
  viewRateHistory: { committee: 'all' },
  /** Make and correct bills (BM-03). */
  manageBills: { manager: 'all' },
  /** See a bill: residents their own, the manager all of them (RES-01, BM-04). */
  viewBills: { resident: 'own', manager: 'all' },
  /** Pay a bill online (RES-01). */
  payBill: { resident: 'own' },
  /** Record a cash or bank payment claim (RES-04). */
  recordPaymentClaim: { resident: 'own' },
  /** Accept or reject a claim; record a payment received directly (BM-04). */
  decidePaymentClaims: { manager: 'all' },
  /** See the defaulters list and send reminders (BM-05). */
  manageDefaulters: { manager: 'all' },
  /** Report a fault, follow it, cancel it before assignment (RES-02). */
  reportFault: { resident: 'own' },
  /** Assign, reopen and close tickets; mark Duplicate or Won't fix (BM-06, BM-07). */
  manageTickets: { manager: 'all' },
  /** Update ticket status, add work notes, report an extra problem (MNT-01 to MNT-05). */
  workOnTickets: { maintenance: 'own' },
  /** Create and cancel guest passes (RES-03). */
  manageGuestPasses: { resident: 'own' },
  /** Check passes; record guest entry and exit; see visitors inside (SG-02, SG-03, SG-04, SG-07). */
  runGate: { guard: 'all' },
  /** Record expenses (BM-08). */
  recordExpenses: { manager: 'all' },
  /** Approve or reject expenses and the opening balance (CM-02). */
  decideExpenses: { committee: 'all' },
  /** Publish the monthly fund summary (BM-12). */
  publishFundSummary: { manager: 'all' },
  /** See the fund summary, totals only (RES-05, CM-04, NFR-12). */
  viewFundSummary: { resident: 'all', manager: 'all', committee: 'all' },
  /** Send announcements (BM-11). */
  sendAnnouncements: { manager: 'all' },
  /** Read announcements (RES-08). */
  readAnnouncements: { resident: 'all', manager: 'all', committee: 'all' },
  /** Give service feedback (RES-07). */
  giveFeedback: { resident: 'all' },
  /** Read feedback; anonymous entries show no flat (CM-03, NFR-11). */
  readFeedback: { committee: 'all' },
  /** Plan guard shifts (BM-09). */
  planShifts: { manager: 'all' },
  /** See own shift (SG-05). */
  viewOwnShift: { guard: 'own' },
  /** Edit emergency numbers (BM-10). */
  editEmergencyNumbers: { manager: 'all' },
  /** See emergency numbers, 999 always first (SG-06). */
  viewEmergencyNumbers: {
    resident: 'all',
    guard: 'all',
    manager: 'all',
    committee: 'all',
    maintenance: 'all',
  },
  /** See a resident's phone number: residents their own, the manager everyone's (NFR-10). */
  viewResidentPhone: { resident: 'own', manager: 'all' },
  /** See one's own account (`GET /api/me`). Not a table row: every signed-in user may see who they are. */
  viewOwnAccount: {
    resident: 'own',
    guard: 'own',
    manager: 'own',
    committee: 'own',
    maintenance: 'own',
    admin: 'own',
  },
} as const satisfies Readonly<Record<string, RoleScopes>>;

/** An action from the permissions table, like `recordPaymentClaim`. */
export type Action = keyof typeof PERMISSIONS;

/** Every action, for tests that try each role against each one. */
export const ACTIONS = Object.keys(PERMISSIONS) as readonly Action[];

/** Shown when a signed-in user's role may not do something. */
export const FORBIDDEN_MESSAGE = "You don't have access to this.";

/** Shown when a user with a temporary password calls anything before choosing their own (BR-15). */
export const CHANGE_PASSWORD_FIRST_MESSAGE = 'Choose your own password before continuing.';

/** The signed-in user a check refers to: just what the permission rules need. */
export interface Actor {
  id: string;
  role: Role;
  /** The household's occupancy, for residents. */
  occupancyId: string | null;
  mustChangePassword: boolean;
}

/** An actor who passed a role check, and how far they may go with that action. */
export interface Authorized<A extends Actor = Actor> {
  actor: A;
  scope: Scope;
}

/**
 * How far a role may go with an action.
 * @param role - The user's role.
 * @param action - The action.
 * @returns `all`, `own`, or null when the role may not do it.
 */
export function scopeFor(role: Role, action: Action): Scope | null {
  const scopes: RoleScopes = PERMISSIONS[action];
  return scopes[role] ?? null;
}

/**
 * The roles that may do an action, in the SRS order.
 * @param action - The action.
 * @returns The roles.
 */
export function rolesFor(action: Action): Role[] {
  return ROLES.filter((role) => scopeFor(role, action) !== null);
}

/**
 * Checks a signed-in user against the table (NFR-06).
 * @param actor - The signed-in user.
 * @param action - What they want to do.
 * @returns The user and their scope for the action.
 * @throws AppError 403 if they still have a temporary password (BR-15) or their role may not do it.
 */
export function checkRole<A extends Actor>(actor: A, action: Action): Authorized<A> {
  if (actor.mustChangePassword) throw new AppError('FORBIDDEN', CHANGE_PASSWORD_FIRST_MESSAGE);
  const scope = scopeFor(actor.role, action);
  if (scope === null) throw new AppError('FORBIDDEN', FORBIDDEN_MESSAGE);
  return { actor, scope };
}

/**
 * For "Own" rows on household records (bills, claims, passes, tickets a resident reported, feedback): a resident
 * may only reach records of their own occupancy, so a new household never sees an earlier one's (BR-09, NFR-13).
 * Users with scope `all` pass.
 * @param user - The result of the role check.
 * @param recordOccupancyId - The record's occupancy; null for a bill made while the flat was vacant.
 * @throws AppError 403 if the record belongs to another occupancy or to no occupancy.
 */
export function requireOwnOccupancy(user: Authorized, recordOccupancyId: string | null): void {
  if (user.scope === 'all') return;
  if (recordOccupancyId === null || user.actor.occupancyId !== recordOccupancyId) {
    throw new AppError('FORBIDDEN', FORBIDDEN_MESSAGE);
  }
}

/**
 * For "Own" rows on assigned work: maintenance staff may only reach tickets assigned to them (NFR-06). Users with
 * scope `all` pass. The ticket feature passes its ticket's assignee.
 * @param user - The result of the role check.
 * @param assigneeId - The profile id the ticket is assigned to, or null if unassigned.
 * @throws AppError 403 if the ticket is not assigned to this user.
 */
export function requireOwnTicket(user: Authorized, assigneeId: string | null): void {
  if (user.scope === 'all') return;
  if (assigneeId === null || assigneeId !== user.actor.id) {
    throw new AppError('FORBIDDEN', FORBIDDEN_MESSAGE);
  }
}
