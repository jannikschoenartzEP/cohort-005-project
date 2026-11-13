import "~/lib/env.server";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Knock, { signUserToken } from "@knocklabs/node";
import type { KnockFeedCredentials, Notification } from "~/lib/notifications";

export type {
  KnockFeedCredentials,
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
  transport?: NotificationTransport
): Promise<void> {
  if (notifications.length === 0) return;

  let chosen: NotificationTransport;
  try {
    chosen = transport ?? defaultTransport();
  } catch (error) {
    console.error(
      `[notifications] Failed to set up sending; dropped ${notifications.length} Notification(s):`,
      error
    );
    return;
  }

  for (const notification of notifications) {
    try {
      await chosen.send(notification);
    } catch (error) {
      console.error(
        `[notifications] Failed to send ${notification.kind} to user ${notification.recipient.id}:`,
        error
      );
    }
  }
}

export function fileTransport(directory: string): NotificationTransport {
  return {
    async send(notification) {
      mkdirSync(directory, { recursive: true });
      const file = join(
        directory,
        `${Date.now()}-${notification.kind}-${notification.recipient.id}.json`
      );
      writeFileSync(file, JSON.stringify(notification, null, 2));
    },
  };
}

/**
 * Knock when KNOCK_API_KEY is set; otherwise (local dev, tests) each
 * Notification is written to a git-ignored folder, like the mailer's .outbox/.
 */
export function chooseTransport(
  env: { KNOCK_API_KEY?: string },
  directory = ".notifications"
): NotificationTransport {
  const apiKey = env.KNOCK_API_KEY;
  return apiKey
    ? knockTransport(new Knock({ apiKey }))
    : fileTransport(directory);
}

function defaultTransport(): NotificationTransport {
  return chooseTransport(process.env);
}

type KnockFeedEnv = {
  KNOCK_PUBLIC_KEY?: string;
  KNOCK_FEED_CHANNEL_ID?: string;
  KNOCK_SIGNING_KEY?: string;
  /** Dev-only override to check token refresh with a short expiry. */
  KNOCK_TOKEN_TTL_SECONDS?: string;
};

const TOKEN_TTL_SECONDS = 60 * 60;

/**
 * Feed credentials for the signed-in person, with a freshly signed user token
 * (enhanced security is on). Null when nobody is signed in or Knock isn't
 * configured, in which case there is no bell.
 */
export async function knockFeedCredentials(
  userId: number | null,
  env: KnockFeedEnv = process.env
): Promise<KnockFeedCredentials | null> {
  const {
    KNOCK_PUBLIC_KEY: knockPublicKey,
    KNOCK_FEED_CHANNEL_ID: knockFeedChannelId,
    KNOCK_SIGNING_KEY: signingKey,
  } = env;
  if (userId === null || !knockPublicKey || !knockFeedChannelId || !signingKey) {
    return null;
  }
  const knockUserId = String(userId);
  const knockUserToken = await signUserToken(knockUserId, {
    signingKey,
    expiresInSeconds:
      Number(env.KNOCK_TOKEN_TTL_SECONDS) || TOKEN_TTL_SECONDS,
  });
  return { knockPublicKey, knockFeedChannelId, knockUserId, knockUserToken };
}
