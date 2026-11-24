/**
 * Shared notification interface and no-op implementation for services.
 *
 * @author Adika Rahman
 */

/** Information required to send an in-app notification. */
export type NotificationInput = {
  /** Profile ID of the notification recipient. */
  recipientId: string;
  /** Notification message. */
  text: string;
  /** Optional destination link for the notification. */
  link?: string | null;
};

/** A function that sends an in-app notification. */
export type Notifier = (notification: NotificationInput) => Promise<void>;

/** A notifier that intentionally does nothing until the real adapter is available. */
export const noopNotifier: Notifier = async () => {};
