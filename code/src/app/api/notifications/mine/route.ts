/**
 * Lists the signed-in user's in-app notifications.
 *
 * @author Adika Rahman
 */
import { databaseNotificationStore } from '@/lib/adapters/notificationAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { listMyNotifications } from '@/services/notificationService';

/**
 * Returns the current user's notifications, newest first.
 * @param request - Incoming request.
 * @returns The notifications or a standard API error.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'readNotifications');
    const notifications = await listMyNotifications(
      { notifications: databaseNotificationStore(db) },
      actor.id,
    );
    return Response.json({ notifications });
  } catch (error) {
    return toErrorResponse(error);
  }
}
