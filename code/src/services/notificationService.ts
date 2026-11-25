/**
 * Notification service: send notifications, list a profile's notifications, and mark them as read.
 *
 * @author Adika Rahman
 */
import { AppError } from '@/lib/errors';
import type { Notification } from '@/models';
import type { NotificationInput, Notifier } from './notifier';

/** Storage operations required by the notification service. */
export interface NotificationStore {
  /**
   * Finds notifications belonging to one recipient.
   * @param recipientId - The profile ID of the recipient.
   * @returns The recipient's notifications.
   */
  listByRecipient(recipientId: string): Promise<Notification[]>;

  /**
   * Marks a notification as read only when it belongs to the recipient.
   * If it is already read, its original readAt value must be preserved.
   * @param recipientId - The profile ID of the recipient.
   * @param notificationId - The notification ID.
   * @param readAt - The time the notification was read.
   * @returns The notification, or undefined if it does not belong to the recipient or does not exist.
   */
  markAsRead(
    recipientId: string,
    notificationId: string,
    readAt: Date,
  ): Promise<Notification | undefined>;
}

/** Dependencies used to send a notification. */
export interface SendNotificationDeps {
  /** Shared notification sender. */
  notifier: Notifier;
}

/** Dependencies used to read or update notifications. */
export interface NotificationServiceDeps {
  /** Notification storage adapter. */
  notifications: NotificationStore;
}

/**
 * Checks that an ID or required text contains non-whitespace characters.
 * @param value - The value to check.
 * @param field - The field name used in the error details.
 * @throws AppError BAD_REQUEST when the value is empty.
 */
function requireNonBlank(value: string, field: string): void {
  if (!value.trim()) {
    throw new AppError('BAD_REQUEST', `${field} is required.`, { field });
  }
}

/**
 * Sends an in-app notification through the shared Notifier interface.
 * @param deps - The notification sender.
 * @param input - The recipient, message and optional link.
 * @throws AppError BAD_REQUEST when the recipient ID or message is blank.
 */
export async function sendNotification(
  deps: SendNotificationDeps,
  input: NotificationInput,
): Promise<void> {
  requireNonBlank(input.recipientId, 'Recipient ID');
  requireNonBlank(input.text, 'Notification text');

  await deps.notifier(input);
}

/**
 * Lists only the notifications belonging to the requested recipient, newest first.
 * @param deps - The notification storage dependency.
 * @param recipientId - The profile ID whose notifications are requested.
 * @returns The recipient's notifications ordered by creation time, newest first.
 * @throws AppError BAD_REQUEST when the recipient ID is blank.
 */
export async function listMyNotifications(
  deps: NotificationServiceDeps,
  recipientId: string,
): Promise<Notification[]> {
  requireNonBlank(recipientId, 'Recipient ID');

  const notifications = await deps.notifications.listByRecipient(recipientId);

  return [...notifications].sort(
    (first, second) => second.createdAt.getTime() - first.createdAt.getTime(),
  );
}

/**
 * Marks one of the recipient's notifications as read.
 * Calling this for an already-read notification must preserve its original readAt value.
 * @param deps - The notification storage dependency.
 * @param recipientId - The profile ID of the recipient.
 * @param notificationId - The notification ID to mark as read.
 * @returns The updated notification.
 * @throws AppError BAD_REQUEST when either ID is blank.
 * @throws AppError NOT_FOUND when the notification does not exist or belongs to another recipient.
 */
export async function markNotificationAsRead(
  deps: NotificationServiceDeps,
  recipientId: string,
  notificationId: string,
): Promise<Notification> {
  requireNonBlank(recipientId, 'Recipient ID');
  requireNonBlank(notificationId, 'Notification ID');

  const notification = await deps.notifications.markAsRead(recipientId, notificationId, new Date());

  if (!notification) {
    throw new AppError('NOT_FOUND', 'Notification not found.', { notificationId });
  }

  return notification;
}
