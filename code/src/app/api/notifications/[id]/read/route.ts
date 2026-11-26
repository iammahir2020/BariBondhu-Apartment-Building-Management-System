/**
 * Marks one of the signed-in user's notifications as read.
 *
 * @author Adika Rahman
 */
import { databaseNotificationStore } from '@/lib/adapters/notificationAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { markNotificationAsRead } from '@/services/notificationService';

/** What Next passes to a route with `[id]` in its address. */
interface NotificationRouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Marks the specified notification as read for its recipient.
 * @param request - Incoming request.
 * @param context - Holds the notification id from the address.
 * @returns The updated notification or a standard API error.
 */
export async function PATCH(
  request: Request,
  context: NotificationRouteContext,
): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'readNotifications');
    const { id } = await context.params;

    const notification = await markNotificationAsRead(
      { notifications: databaseNotificationStore(db) },
      actor.id,
      id,
    );

    return Response.json({ notification });
  } catch (error) {
    return toErrorResponse(error);
  }
}
