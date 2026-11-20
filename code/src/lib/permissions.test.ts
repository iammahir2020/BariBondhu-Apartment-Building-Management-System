/**
 * Tests for the role check (NFR-06): every role against every action, compared with the permissions table in
 * `docs/sds/design-inputs-from-srs.md` written out again here by hand, so a wrong edit to `PERMISSIONS` fails a
 * test. Also the "Own" checks (BR-09, NFR-13) and the first-login block (BR-15).
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import {
  ACTIONS,
  CHANGE_PASSWORD_FIRST_MESSAGE,
  FORBIDDEN_MESSAGE,
  checkRole,
  requireOwnOccupancy,
  requireOwnTicket,
  rolesFor,
  scopeFor,
  type Action,
  type Actor,
  type Scope,
} from '@/lib/permissions';
import { ROLES, type Role } from '@/lib/roles';

/** The permissions table, row by row: which roles may do each action and how far. */
const TABLE: Record<Action, Partial<Record<Role, Scope>>> = {
  setUpBuilding: { admin: 'all' },
  manageAccounts: { manager: 'all' },
  endOccupancy: { manager: 'all' },
  setChargeRates: { committee: 'all' },
  manageBills: { manager: 'all' },
  viewBills: { resident: 'own', manager: 'all' },
  payBill: { resident: 'own' },
  recordPaymentClaim: { resident: 'own' },
  decidePaymentClaims: { manager: 'all' },
  manageDefaulters: { manager: 'all' },
  reportFault: { resident: 'own' },
  manageTickets: { manager: 'all' },
  workOnTickets: { maintenance: 'own' },
  manageGuestPasses: { resident: 'own' },
  runGate: { guard: 'all' },
  recordExpenses: { manager: 'all' },
  decideExpenses: { committee: 'all' },
  publishFundSummary: { manager: 'all' },
  viewFundSummary: { resident: 'all', manager: 'all', committee: 'all' },
  sendAnnouncements: { manager: 'all' },
  readAnnouncements: { resident: 'all', manager: 'all', committee: 'all' },
  giveFeedback: { resident: 'all' },
  readFeedback: { committee: 'all' },
  planShifts: { manager: 'all' },
  viewOwnShift: { guard: 'own' },
  editEmergencyNumbers: { manager: 'all' },
  viewEmergencyNumbers: {
    resident: 'all',
    guard: 'all',
    manager: 'all',
    committee: 'all',
    maintenance: 'all',
  },
  viewResidentPhone: { resident: 'own', manager: 'all' },
  viewOwnAccount: {
    resident: 'own',
    guard: 'own',
    manager: 'own',
    committee: 'own',
    maintenance: 'own',
    admin: 'own',
  },
};

function actor(role: Role, overrides: Partial<Actor> = {}): Actor {
  return {
    id: `${role}-1`,
    role,
    occupancyId: role === 'resident' ? 'occupancy-1' : null,
    mustChangePassword: false,
    ...overrides,
  };
}

function forbidden(run: () => unknown, message = FORBIDDEN_MESSAGE): void {
  expect(run).toThrow(AppError);
  try {
    run();
  } catch (error) {
    expect(error).toMatchObject({ status: 403, message });
  }
}

describe('PERMISSIONS', () => {
  it('has exactly the actions of the table', () => {
    expect([...ACTIONS].sort()).toEqual(Object.keys(TABLE).sort());
  });

  describe.each(ACTIONS)('%s', (action) => {
    it.each(ROLES)('%s gets the scope the table gives it (NFR-06)', (role) => {
      const expected = TABLE[action][role] ?? null;
      expect(scopeFor(role, action)).toBe(expected);
      if (expected === null) {
        forbidden(() => checkRole(actor(role), action));
      } else {
        expect(checkRole(actor(role), action).scope).toBe(expected);
      }
    });
  });

  it('lists the allowed roles in the SRS order', () => {
    expect(rolesFor('readAnnouncements')).toEqual(['resident', 'manager', 'committee']);
    expect(rolesFor('setUpBuilding')).toEqual(['admin']);
  });

  it('keeps the administrator out of bills, payments, tickets and feedback (ADM-01)', () => {
    const kept: Action[] = ['viewBills', 'decidePaymentClaims', 'manageTickets', 'readFeedback'];
    for (const action of kept) forbidden(() => checkRole(actor('admin'), action));
  });

  it("never shows residents' phone numbers to guards, maintenance or the committee (NFR-10)", () => {
    for (const role of ['guard', 'maintenance', 'committee', 'admin'] as const) {
      forbidden(() => checkRole(actor(role), 'viewResidentPhone'));
    }
  });
});

describe('checkRole', () => {
  it('returns the actor and scope (normal)', () => {
    const resident = actor('resident');
    expect(checkRole(resident, 'payBill')).toEqual({ actor: resident, scope: 'own' });
  });

  it('refuses everything until a temporary password is replaced, even allowed actions (BR-15)', () => {
    const fresh = actor('manager', { mustChangePassword: true });
    forbidden(() => checkRole(fresh, 'viewOwnAccount'), CHANGE_PASSWORD_FIRST_MESSAGE);
    forbidden(() => checkRole(fresh, 'manageBills'), CHANGE_PASSWORD_FIRST_MESSAGE);
  });
});

describe('requireOwnOccupancy', () => {
  const resident = checkRole(actor('resident'), 'viewBills');
  const manager = checkRole(actor('manager'), 'viewBills');

  it("lets a resident reach their own occupancy's record (normal)", () => {
    expect(() => requireOwnOccupancy(resident, 'occupancy-1')).not.toThrow();
  });

  it("refuses an earlier household's record of the same flat (NFR-13)", () => {
    forbidden(() => requireOwnOccupancy(resident, 'occupancy-0'));
  });

  it('refuses a bill made while the flat was vacant (BR-09, boundary: no occupancy)', () => {
    forbidden(() => requireOwnOccupancy(resident, null));
  });

  it('refuses a resident whose account has no occupancy (exception)', () => {
    const broken = checkRole(actor('resident', { occupancyId: null }), 'viewBills');
    forbidden(() => requireOwnOccupancy(broken, 'occupancy-1'));
  });

  it('lets the manager reach any occupancy and vacant-flat bills (scope all)', () => {
    expect(() => requireOwnOccupancy(manager, 'occupancy-0')).not.toThrow();
    expect(() => requireOwnOccupancy(manager, null)).not.toThrow();
  });
});

describe('requireOwnTicket', () => {
  const staff = checkRole(actor('maintenance'), 'workOnTickets');
  const manager = checkRole(actor('manager'), 'manageTickets');

  it('lets maintenance staff reach a ticket assigned to them (normal)', () => {
    expect(() => requireOwnTicket(staff, 'maintenance-1')).not.toThrow();
  });

  it("refuses another person's ticket and an unassigned one (NFR-06)", () => {
    forbidden(() => requireOwnTicket(staff, 'maintenance-2'));
    forbidden(() => requireOwnTicket(staff, null));
  });

  it('lets the manager reach any ticket (scope all)', () => {
    expect(() => requireOwnTicket(manager, 'maintenance-2')).not.toThrow();
  });
});
