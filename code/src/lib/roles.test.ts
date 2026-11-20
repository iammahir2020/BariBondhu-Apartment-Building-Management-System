/**
 * Tests for the role list: `isRole` accepts exactly the six roles, for values read from the database or a request.
 *
 * @author Mahir Al Kamal
 */
import { ROLES, ROLE_LABELS, isRole } from '@/lib/roles';

describe('isRole', () => {
  it.each(ROLES)('accepts %s (normal)', (role) => {
    expect(isRole(role)).toBe(true);
  });

  it.each(['Resident', 'owner', '', ' guard'])('refuses %p (invalid input)', (value) => {
    expect(isRole(value)).toBe(false);
  });

  it.each([null, undefined, 1, {}, ['manager']])(
    'refuses %p, which is not a string (exception)',
    (value) => {
      expect(isRole(value)).toBe(false);
    },
  );
});

describe('ROLE_LABELS', () => {
  it('names every role the way the SRS does', () => {
    expect(ROLE_LABELS).toEqual({
      resident: 'Resident',
      guard: 'Security guard',
      manager: 'Building manager',
      committee: 'Committee member',
      maintenance: 'Maintenance staff',
      admin: 'System administrator',
    });
  });
});
