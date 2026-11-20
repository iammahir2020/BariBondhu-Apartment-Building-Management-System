/**
 * Reads required environment variables and fails early, with the variable's name, when one is missing.
 *
 * @author Mahir Al Kamal
 */

/**
 * Returns an environment variable that must be set.
 * @param name - Variable name, as listed in `.env.example`.
 * @returns Its value.
 * @throws Error if it is missing or empty.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}
