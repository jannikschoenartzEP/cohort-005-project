import "~/lib/env.server";
import Knock from "@knocklabs/node";
import type { Notification } from "~/lib/notifications";

export type {
  Notification,
  NotificationKind,
  NotificationPerson,
} from "~/lib/notifications";

// ─── Notifications ───
// The only module that talks to Knock. Domain functions return Notification
// values; route actions hand them to notify() after the database write.

export interface NotificationTransport {
  send(notification: Notification): Promise<void>;
}

/** The slice of the Knock client the Knock transport uses. */
export type KnockWorkflows = {
  workflows: {
    trigger(
      key: string,
      body: {
        recipients: { id: string; name: string; email: string }[];
        actor?: { id: string; name: string; email: string };
        data: { title: string; body: string; link: string };
      }
    ): Promise<unknown>;
  };
};

export function knockTransport(knock: KnockWorkflows): NotificationTransport {
  return {
    async send(notification) {
      const { recipient, actor } = notification;
      await knock.workflows.trigger(notification.kind, {
        recipients: [
          {
            id: String(recipient.id),
            name: recipient.name,
            email: recipient.email,
          },
        ],
        // Sent inline: Knock rejects the whole trigger for an actor id it
        // has never seen.
        actor:
          actor === null
            ? undefined
            : { id: String(actor.id), name: actor.name, email: actor.email },
        data: {
          title: notification.title,
          body: notification.body ?? "",
          link: notification.link,
        },
      });
    },
  };
}

/**
 * Best effort: every failure is logged and swallowed, so the action that
 * caused the Notifications still succeeds (unlike email). Nothing is retried.
 */
export async function notify(
  notifications: Notification[],
  transport: NotificationTransport = defaultTransport()
): Promise<void> {
  for (const notification of notifications) {
    try {
      await transport.send(notification);
    } catch (error) {
      console.error(
        `[notifications] Failed to send ${notification.kind} to user ${notification.recipient.id}:`,
        error
      );
    }
  }
}

function defaultTransport(): NotificationTransport {
  return knockTransport(new Knock({ apiKey: process.env.KNOCK_API_KEY }));
}
