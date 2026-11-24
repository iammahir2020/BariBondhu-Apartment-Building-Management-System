/**
 * The secret the gateway signs its server-to-server messages with (RES-01, BR-02), from `GATEWAY_WEBHOOK_SECRET`.
 * Server only. When it isn't set, the webhook refuses every message, so a missing setting can never let an unsigned
 * message through.
 *
 * @author Mahir Al Kamal
 */
import 'server-only';

/**
 * Reads the gateway secret.
 * @returns The secret, or an empty string if it isn't set.
 */
export function gatewaySecret(): string {
  return process.env.GATEWAY_WEBHOOK_SECRET ?? '';
}
