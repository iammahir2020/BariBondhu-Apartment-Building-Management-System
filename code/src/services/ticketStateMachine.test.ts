/**
 * Tests for the ticket state machine: every change the state diagram allows, the changes it refuses, who may make
 * each one, and which need a reason (RES-02, BM-06, BM-07, MNT-03).
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import { ROLES, type Role } from '@/lib/roles';
import { ticketStatusEnum, type TicketStatus } from '@/models/Ticket';
import {
  FINAL_TICKET_STATUSES,
  TICKET_TRANSITIONS,
  allowedTicketTransitions,
  checkTicketTransition,
  isFinalTicketStatus,
} from '@/services/ticketStateMachine';

const STATUSES: readonly TicketStatus[] = ticketStatusEnum.enumValues;

/** Runs the check and returns the AppError it throws, or fails the test if it doesn't throw one. */
function errorFrom(run: () => unknown): AppError {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('Expected an AppError');
}

describe('checkTicketTransition: allowed changes', () => {
  it.each([
    ['Reported', 'Assigned', 'manager', undefined],
    ['Assigned', 'In progress', 'maintenance', undefined],
    ['In progress', 'On hold', 'maintenance', 'Waiting for parts'],
    ['On hold', 'In progress', 'maintenance', undefined],
    ['In progress', 'Fixed', 'maintenance', undefined],
    ['Fixed', 'Closed', 'manager', undefined],
    ['Fixed', 'Assigned', 'manager', 'Still leaking'],
    ['Reported', 'Cancelled', 'resident', undefined],
    ['Reported', 'Duplicate', 'manager', 'Same as the lift 1 ticket'],
    ['Reported', "Won't fix", 'manager', 'Inside the flat, owner’s own repair'],
  ] as const)('lets the %s → %s change through for the %s', (from, to, role, reason) => {
    expect(checkTicketTransition(from, to, role, reason)).toMatchObject({ from, to, role });
  });

  it('lists exactly the ten changes in the state diagram', () => {
    expect(TICKET_TRANSITIONS).toHaveLength(10);
  });
});

describe('checkTicketTransition: changes the diagram refuses (409)', () => {
  it('refuses Assigned straight to Fixed (MNT-03)', () => {
    const error = errorFrom(() => checkTicketTransition('Assigned', 'Fixed', 'maintenance'));
    expect(error.status).toBe(409);
    expect(error.message).toBe('A ticket cannot go from Assigned to Fixed.');
  });

  it('refuses reopening a Closed ticket and says to report a new one (BM-07)', () => {
    const error = errorFrom(() =>
      checkTicketTransition('Closed', 'Assigned', 'manager', 'Broke again'),
    );
    expect(error.status).toBe(409);
    expect(error.message).toBe(
      'A Closed ticket cannot be reopened. Report the fault as a new ticket.',
    );
  });

  it('refuses a resident cancelling once the ticket is Assigned (RES-02)', () => {
    const error = errorFrom(() => checkTicketTransition('Assigned', 'Cancelled', 'resident'));
    expect(error.status).toBe(409);
  });

  it('refuses closing a ticket that is not Fixed yet (BM-07)', () => {
    expect(errorFrom(() => checkTicketTransition('In progress', 'Closed', 'manager')).status).toBe(
      409,
    );
  });

  it('refuses a change to the same status', () => {
    expect(errorFrom(() => checkTicketTransition('On hold', 'On hold', 'maintenance')).status).toBe(
      409,
    );
  });

  it.each(['Closed', 'Cancelled', 'Duplicate', "Won't fix"] as const)(
    'lets nothing leave the final status %s',
    (from) => {
      for (const to of STATUSES) {
        for (const role of ROLES) {
          expect(errorFrom(() => checkTicketTransition(from, to, role, 'reason')).status).toBe(409);
        }
      }
    },
  );

  it('refuses every pair not in the diagram, for every role', () => {
    const allowed = new Set(TICKET_TRANSITIONS.map((t) => `${t.from}→${t.to}`));
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (allowed.has(`${from}→${to}`)) continue;
        for (const role of ROLES) {
          expect(errorFrom(() => checkTicketTransition(from, to, role, 'reason')).code).toBe(
            'CONFLICT',
          );
        }
      }
    }
  });
});

describe('checkTicketTransition: wrong role (403)', () => {
  it.each(TICKET_TRANSITIONS.map((t) => [t.from, t.to, t.role] as const))(
    'lets only the right role make %s → %s (%s)',
    (from, to, owner) => {
      for (const role of ROLES.filter((r): r is Role => r !== owner)) {
        const error = errorFrom(() => checkTicketTransition(from, to, role, 'reason'));
        expect(error.status).toBe(403);
      }
    },
  );

  it('stops maintenance staff closing a Fixed ticket (BM-07 note)', () => {
    const error = errorFrom(() => checkTicketTransition('Fixed', 'Closed', 'maintenance'));
    expect(error.status).toBe(403);
    expect(error.message).toBe(
      'Only the building manager can change a ticket from Fixed to Closed.',
    );
  });

  it('stops the manager starting the work', () => {
    expect(
      errorFrom(() => checkTicketTransition('Assigned', 'In progress', 'manager')).status,
    ).toBe(403);
  });
});

describe('checkTicketTransition: reasons (400)', () => {
  it.each([
    ['In progress', 'On hold', 'maintenance'],
    ['Fixed', 'Assigned', 'manager'],
    ['Reported', 'Duplicate', 'manager'],
    ['Reported', "Won't fix", 'manager'],
  ] as const)('asks for a reason for %s → %s', (from, to, role) => {
    for (const reason of [undefined, null, '', '   ']) {
      const error = errorFrom(() => checkTicketTransition(from, to, role, reason));
      expect(error.status).toBe(400);
      expect(error.message).toBe('Give a reason.');
    }
  });

  it('accepts a one-character reason', () => {
    expect(() => checkTicketTransition('In progress', 'On hold', 'maintenance', 'x')).not.toThrow();
  });

  it('does not need a reason to close a Fixed ticket', () => {
    expect(() => checkTicketTransition('Fixed', 'Closed', 'manager')).not.toThrow();
  });

  it('checks the role before the reason', () => {
    expect(errorFrom(() => checkTicketTransition('Fixed', 'Assigned', 'resident')).status).toBe(
      403,
    );
  });
});

describe('allowedTicketTransitions', () => {
  it('gives the manager Closed and Assigned on a Fixed ticket', () => {
    expect(allowedTicketTransitions('Fixed', 'manager').map((t) => t.to)).toEqual([
      'Closed',
      'Assigned',
    ]);
  });

  it('gives the manager Assigned, Duplicate and Won’t fix on a Reported ticket', () => {
    expect(allowedTicketTransitions('Reported', 'manager').map((t) => t.to)).toEqual([
      'Assigned',
      'Duplicate',
      "Won't fix",
    ]);
  });

  it('gives the resident only Cancelled on a Reported ticket', () => {
    expect(allowedTicketTransitions('Reported', 'resident').map((t) => t.to)).toEqual([
      'Cancelled',
    ]);
  });

  it('gives maintenance staff On hold and Fixed while In progress', () => {
    expect(allowedTicketTransitions('In progress', 'maintenance').map((t) => t.to)).toEqual([
      'On hold',
      'Fixed',
    ]);
  });

  it('gives roles outside the ticket flow nothing', () => {
    for (const status of STATUSES) {
      for (const role of ['guard', 'committee', 'admin'] as const) {
        expect(allowedTicketTransitions(status, role)).toEqual([]);
      }
    }
  });

  it('gives nobody anything on a Closed ticket', () => {
    for (const role of ROLES) expect(allowedTicketTransitions('Closed', role)).toEqual([]);
  });
});

describe('isFinalTicketStatus', () => {
  it.each(FINAL_TICKET_STATUSES)('treats %s as final', (status) => {
    expect(isFinalTicketStatus(status)).toBe(true);
  });

  it.each(['Reported', 'Assigned', 'In progress', 'On hold', 'Fixed'] as const)(
    'treats %s as open',
    (status) => {
      expect(isFinalTicketStatus(status)).toBe(false);
    },
  );

  it('agrees with the transition list: final statuses have no way out', () => {
    for (const status of STATUSES) {
      const hasWayOut = TICKET_TRANSITIONS.some((t) => t.from === status);
      expect(isFinalTicketStatus(status)).toBe(!hasWayOut);
    }
  });
});
