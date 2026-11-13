// ─── Notifications (shared types) ───
// Safe to import from client code. Sending lives in notifications.server.ts.

/** One Knock workflow per kind; the kind is the workflow key. */
export const NOTIFICATION_KINDS = [
  "refund-request-raised",
  "refund-request-approved",
  "refund-request-declined",
  "seat-claimed",
  "question-asked",
  "reply-posted",
  "course-status-changed",
  "role-changed",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationPerson = { id: number; name: string; email: string };

/** A user (or any row with their id, name and email) as a NotificationPerson. */
export function personOf(user: NotificationPerson): NotificationPerson {
  return { id: user.id, name: user.name, email: user.email };
}

export type Notification = {
  kind: NotificationKind;
  recipient: NotificationPerson;
  /** The person who acted. Shown in the feed; never used to pick recipients. */
  actor: NotificationPerson | null;
  title: string;
  body?: string;
  link: string;
};

export function isNotificationKind(key: string): key is NotificationKind {
  return NOTIFICATION_KINDS.some((kind) => kind === key);
}

/** What the browser needs to open a person's Knock feed. */
export type KnockFeedCredentials = {
  knockPublicKey: string;
  knockFeedChannelId: string;
  knockUserId: string;
  knockUserToken: string;
};
