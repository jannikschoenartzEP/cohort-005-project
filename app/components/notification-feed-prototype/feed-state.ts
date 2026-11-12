// PROTOTYPE — throwaway. Answers wayfinder ticket "How should the Notification
// feed and toasts look?". In-memory stub standing in for Knock's feed
// (`@knocklabs/react`) so we can judge layout without a Knock account.
// Never merge to main.
import { useCallback, useEffect, useState } from "react";
import { UserRole } from "~/db/schema";

export type NotificationKind =
  | "refund-request-raised"
  | "refund-approved"
  | "refund-declined"
  | "seat-claimed"
  | "question-asked"
  | "reply-posted"
  | "course-status-changed"
  | "role-changed";

export interface ProtoNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  url: string;
  actorName?: string;
  createdAt: number;
  seenAt: number | null; // Knock distinguishes "seen" (badge) from "read"
  readAt: number | null;
}

type Template = Omit<ProtoNotification, "id" | "createdAt" | "seenAt" | "readAt">;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const templates: Record<NotificationKind, Template[]> = {
  "refund-request-raised": [
    {
      kind: "refund-request-raised",
      title: "Refund Request from Maya Chen",
      body: "“Intro to TypeScript” — “The course wasn't what I expected.”",
      url: "/admin/refunds",
      actorName: "Maya Chen",
    },
  ],
  "refund-approved": [
    {
      kind: "refund-approved",
      title: "Your Refund Request was approved",
      body: "“Advanced React Patterns” — you'll get your money back soon.",
      url: "/dashboard",
    },
  ],
  "refund-declined": [
    {
      kind: "refund-declined",
      title: "Your Refund Request was declined",
      body: "“Node.js Fundamentals” — you've watched past the Watch Limit.",
      url: "/dashboard",
    },
  ],
  "seat-claimed": [
    {
      kind: "seat-claimed",
      title: "Jordan Lee claimed a Seat",
      body: "“Intro to TypeScript” — 3 of 10 Seats left.",
      url: "/team",
      actorName: "Jordan Lee",
    },
  ],
  "question-asked": [
    {
      kind: "question-asked",
      title: "New Question on “Generics 101”",
      body: "Sam Rivera: “Why does `T extends object` reject arrays here?”",
      url: "/instructor/questions",
      actorName: "Sam Rivera",
    },
  ],
  "reply-posted": [
    {
      kind: "reply-posted",
      title: "Alex Kim replied to your Comment",
      body: "“Good question — it's because of how narrowing works on…”",
      url: "/courses",
      actorName: "Alex Kim",
    },
  ],
  "course-status-changed": [
    {
      kind: "course-status-changed",
      title: "“Intro to TypeScript” was unpublished",
      body: "A Platform Admin changed its status to Draft.",
      url: "/instructor",
    },
  ],
  "role-changed": [
    {
      kind: "role-changed",
      title: "You're now an Instructor",
      body: "A Platform Admin changed your role.",
      url: "/instructor",
    },
  ],
};

export function kindsForRole(role: UserRole | null, isTeamAdmin: boolean): NotificationKind[] {
  const kinds: NotificationKind[] = ["role-changed", "reply-posted"];
  if (role === UserRole.Student) kinds.push("refund-approved", "refund-declined");
  if (role === UserRole.Instructor) kinds.push("question-asked", "course-status-changed");
  if (role === UserRole.Admin) kinds.push("refund-request-raised");
  if (isTeamAdmin) kinds.push("seat-claimed");
  return kinds;
}

let counter = 0;
function make(t: Template, ageMs: number, read: boolean): ProtoNotification {
  const createdAt = Date.now() - ageMs;
  return {
    ...t,
    id: `n${++counter}`,
    createdAt,
    seenAt: read ? createdAt : null,
    readAt: read ? createdAt : null,
  };
}

function seed(kinds: NotificationKind[]): ProtoNotification[] {
  const ages = [4 * MIN, 50 * MIN, 3 * HOUR, 1 * DAY + 2 * HOUR, 3 * DAY, 9 * DAY];
  return ages.map((age, i) => make(templates[kinds[i % kinds.length]][0], age, i >= 2));
}

export type FeedMode = "normal" | "empty" | "many";

// Module-level store so all variants + the switcher share one feed.
type Listener = () => void;
const store = {
  items: [] as ProtoNotification[],
  kinds: [] as NotificationKind[],
  listeners: new Set<Listener>(),
  newListeners: new Set<(n: ProtoNotification) => void>(),
  set(items: ProtoNotification[]) {
    this.items = items;
    this.listeners.forEach((l) => l());
  },
};

export function resetFeed(kinds: NotificationKind[], mode: FeedMode) {
  store.kinds = kinds;
  if (mode === "empty") return store.set([]);
  if (mode === "many") {
    const many = Array.from({ length: 30 }, (_, i) =>
      make(templates[kinds[i % kinds.length]][0], i * 5 * HOUR + MIN, i >= 7)
    );
    return store.set(many);
  }
  store.set(seed(kinds));
}

/** Simulates Knock's real-time "items.received.realtime" event. */
export function fireIncoming() {
  const kinds = store.kinds.length ? store.kinds : (["reply-posted"] as NotificationKind[]);
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const n = make(templates[kind][0], 0, false);
  store.set([n, ...store.items]);
  store.newListeners.forEach((l) => l(n));
}

export function onIncoming(cb: (n: ProtoNotification) => void) {
  store.newListeners.add(cb);
  return () => {
    store.newListeners.delete(cb);
  };
}

export function useFeed() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    store.listeners.add(l);
    return () => {
      store.listeners.delete(l);
    };
  }, []);

  const items = store.items;
  const markRead = useCallback((id: string) => {
    const now = Date.now();
    store.set(store.items.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? now, seenAt: n.seenAt ?? now } : n)));
  }, []);
  const markUnread = useCallback((id: string) => {
    store.set(store.items.map((n) => (n.id === id ? { ...n, readAt: null } : n)));
  }, []);
  const markAllRead = useCallback(() => {
    const now = Date.now();
    store.set(store.items.map((n) => ({ ...n, readAt: n.readAt ?? now, seenAt: n.seenAt ?? now })));
  }, []);
  const markAllSeen = useCallback(() => {
    const now = Date.now();
    store.set(store.items.map((n) => ({ ...n, seenAt: n.seenAt ?? now })));
  }, []);

  return {
    items,
    unreadCount: items.filter((n) => !n.readAt).length,
    unseenCount: items.filter((n) => !n.seenAt).length,
    markRead,
    markUnread,
    markAllRead,
    markAllSeen,
  };
}

export function timeAgo(ts: number) {
  const d = Date.now() - ts;
  if (d < MIN) return "just now";
  if (d < HOUR) return `${Math.floor(d / MIN)}m`;
  if (d < DAY) return `${Math.floor(d / HOUR)}h`;
  return `${Math.floor(d / DAY)}d`;
}

export function dayGroup(ts: number): "Today" | "This week" | "Earlier" {
  const d = Date.now() - ts;
  if (d < DAY) return "Today";
  if (d < 7 * DAY) return "This week";
  return "Earlier";
}
