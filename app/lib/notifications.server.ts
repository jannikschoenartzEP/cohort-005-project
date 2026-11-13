import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Knock, { signUserToken } from "@knocklabs/node";

// ─── Notifications (SPIKE: spike/knock-round-trip, never merged) ───
// The only file that talks to Knock. Domain functions return Notification
// values; route actions hand them to notify(), which is best-effort: a Knock
// failure is logged and swallowed, never failing the action.

export type NotificationKind = "refund-request-raised";

export type Recipient = { id: number; name: string; email: string };

export type Notification = {
  kind: NotificationKind;
  recipient: Recipient;
  // Sent inline: Knock rejects an actor id it has never seen.
  actor: Recipient | null;
  title: string;
  body?: string;
  link: string;
};

export interface NotificationTransport {
  send(notification: Notification): Promise<void>;
}

export function knockTransport(apiKey: string): NotificationTransport {
  const knock = new Knock({ apiKey });
  return {
    async send(n) {
      await knock.workflows.trigger(n.kind, {
        recipients: [
          {
            id: String(n.recipient.id),
            name: n.recipient.name,
            email: n.recipient.email,
          },
        ],
        actor:
          n.actor === null
            ? undefined
            : { id: String(n.actor.id), name: n.actor.name, email: n.actor.email },
        data: { title: n.title, body: n.body ?? "", link: n.link },
      });
    },
  };
}

export function fileTransport(directory: string): NotificationTransport {
  return {
    async send(n) {
      mkdirSync(directory, { recursive: true });
      const file = join(directory, `${Date.now()}-${n.kind}-${n.recipient.id}.json`);
      writeFileSync(file, JSON.stringify(n, null, 2));
    },
  };
}

function defaultTransport(): NotificationTransport {
  const apiKey = process.env.KNOCK_API_KEY;
  return apiKey ? knockTransport(apiKey) : fileTransport(".notifications");
}

export async function notify(
  notifications: Notification[],
  transport: NotificationTransport = defaultTransport()
): Promise<void> {
  for (const n of notifications) {
    try {
      await transport.send(n);
    } catch (error) {
      console.error(
        `[notifications] Failed to send ${n.kind} to user ${n.recipient.id}:`,
        error
      );
    }
  }
}

// ─── Client credentials ───

// SPIKE: overridable so token refresh can be watched without waiting an hour.
export const KNOCK_TOKEN_TTL_SECONDS =
  Number(process.env.KNOCK_TOKEN_TTL_SECONDS) || 60 * 60;

export async function knockClientCredentials(userId: number) {
  const publicKey = process.env.KNOCK_PUBLIC_KEY;
  const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID;
  if (!process.env.KNOCK_API_KEY || !publicKey || !feedChannelId) return null;

  const knockUserId = String(userId);
  const knockUserToken = process.env.KNOCK_SIGNING_KEY
    ? await signUserToken(knockUserId, {
        signingKey: process.env.KNOCK_SIGNING_KEY,
        expiresInSeconds: KNOCK_TOKEN_TTL_SECONDS,
      })
    : null;

  return { knockPublicKey: publicKey, feedChannelId, knockUserId, knockUserToken };
}
