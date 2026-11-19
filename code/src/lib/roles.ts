/**
 * The six user roles, in one place: their IDs (also the URL folders, like `/resident`) and the names shown on
 * screen. The database's role enum is built from {@link ROLES} in step 5, so the two can't drift apart.
 *
 * @author Mahir Al Kamal
 */

/** Every role, in the order the SRS lists the user classes. */
export const ROLES = ['resident', 'guard', 'manager', 'committee', 'maintenance', 'admin'] as const;

/** One of the six roles. */
export type Role = (typeof ROLES)[number];

/** Role names as the SRS writes them, for headings and the app shell. */
export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  resident: 'Resident',
  guard: 'Security guard',
  manager: 'Building manager',
  committee: 'Committee member',
  maintenance: 'Maintenance staff',
  admin: 'System administrator',
};

/**
 * Checks whether a value is one of the six roles, for data read from the database or a request.
 * @param value - Any value.
 * @returns True when `value` is a role.
 */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
