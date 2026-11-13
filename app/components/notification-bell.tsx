import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  KnockFeedProvider,
  KnockProvider,
  useFeedSettings,
  useKnockFeed,
} from "@knocklabs/react";
import type { FeedEventPayload, FeedItem } from "@knocklabs/client";
import {
  Bell,
  BellOff,
  CheckCircle2,
  MessageSquare,
  Receipt,
  Reply,
  Shield,
  UserCog,
  UsersRound,
  XCircle,
} from "lucide-react";
import { cn, formatRelativeTime } from "~/lib/utils";
import {
  isNotificationKind,
  type KnockFeedCredentials,
  type NotificationKind,
} from "~/lib/notifications";

// ─── Notification bell ───
// The signed-in person's Knock feed: bell + popover in the sidebar header and
// a toast for each Notification that arrives in real time.

/**
 * Module-level so it is stable: an inline callback makes Knock rebuild its
 * client and fall back to the (expired) token prop.
 */
async function refreshUserToken(): Promise<string | void> {
  const response = await fetch("/api/knock-token");
  if (!response.ok) return;
  const body: unknown = await response.json();
  if (
    typeof body === "object" &&
    body !== null &&
    "token" in body &&
    typeof body.token === "string"
  ) {
    return body.token;
  }
}

export function NotificationBell({
  credentials,
}: {
  credentials: KnockFeedCredentials;
}) {
  const { knockPublicKey, knockFeedChannelId, knockUserId, knockUserToken } =
    credentials;
  // Knock authenticates while rendering, so keep it idle until hydrated:
  // no Knock calls during the server render.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const user = useMemo(() => ({ id: knockUserId }), [knockUserId]);

  // Not keyed by user: switching users in the DevUI changes these props and
  // Knock re-authenticates in place.
  return (
    <KnockProvider
      apiKey={knockPublicKey}
      user={user}
      userToken={knockUserToken}
      onUserTokenExpiring={refreshUserToken}
      identificationStrategy="skip"
      enabled={hydrated}
    >
      <KnockFeedProvider feedId={knockFeedChannelId}>
        <BellAndFeed enabled={hydrated} />
      </KnockFeedProvider>
    </KnockProvider>
  );
}

type ItemContent = { title: string; body: string; link: string };

function contentOf(item: FeedItem): ItemContent {
  const data = item.data ?? {};
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    title: text(data.title),
    body: text(data.body),
    link: text(data.link) || "/",
  };
}

function BellAndFeed({ enabled }: { enabled: boolean }) {
  const { feedClient, useFeedStore } = useKnockFeed();
  const { items, metadata } = useFeedStore();
  const { settings } = useFeedSettings(feedClient);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unseen = metadata.unseen_count;
  const unread = metadata.unread_count;

  useEffect(() => {
    if (enabled) feedClient.fetch();
  }, [enabled, feedClient]);

  useEffect(() => {
    function showToasts({ items: received }: FeedEventPayload) {
      for (const item of received) {
        const { title, body, link } = contentOf(item);
        toast(title, {
          description: body || undefined,
          duration: 5000,
          action: {
            label: "View",
            onClick: () => {
              feedClient.markAsRead(item);
              navigate(link);
            },
          },
        });
      }
    }
    feedClient.on("items.received.realtime", showToasts);
    return () => feedClient.off("items.received.realtime", showToasts);
  }, [feedClient, navigate]);

  useEffect(() => {
    if (!open) return;
    if (unseen > 0) feedClient.markAllAsSeen();
  }, [open, unseen, feedClient]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (
        ref.current &&
        event.target instanceof Node &&
        !ref.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function openItem(item: FeedItem) {
    feedClient.markAsRead(item);
    setOpen(false);
    navigate(contentOf(item).link);
  }

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        aria-label={
          unseen > 0 ? `Notifications (${unseen} new)` : "Notifications"
        }
        aria-expanded={open}
        className={cn(
          "relative rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          open && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <Bell className="size-4" />
        {unseen > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full top-0 z-40 ml-3 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => feedClient.markAllAsRead()}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <BellOff className="size-8 text-muted-foreground/50" />
              <div className="text-sm font-medium">You're all caught up</div>
              <div className="text-xs text-muted-foreground">
                Notifications about your courses and Refund Requests show up
                here.
              </div>
            </div>
          ) : (
            <ul className="max-h-[28rem] divide-y overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <FeedEntry item={item} onOpen={openItem} />
                </li>
              ))}
            </ul>
          )}
          {settings?.features.branding_required && (
            <div className="border-t px-4 py-2 text-center text-[11px] text-muted-foreground">
              <a
                href="https://knock.app?utm_source=powered-by-knock&utm_medium=referral&utm_campaign=knock-branding-feed"
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                Powered by Knock
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FeedEntry({
  item,
  onOpen,
}: {
  item: FeedItem;
  onOpen: (item: FeedItem) => void;
}) {
  const { title, body } = contentOf(item);
  const unread = item.read_at === null;
  const actor = item.actors[0];
  const actorName =
    actor && "name" in actor && typeof actor.name === "string"
      ? actor.name
      : null;
  const kind = item.source.key;

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent",
        unread && "bg-primary/5"
      )}
    >
      {actorName ? (
        <ActorAvatar name={actorName} />
      ) : (
        isNotificationKind(kind) && <KindIcon kind={kind} />
      )}
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-sm",
            unread ? "font-semibold" : "text-muted-foreground"
          )}
        >
          {title}
        </div>
        {body && (
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {body}
          </div>
        )}
        <div
          className="mt-1 text-[11px] text-muted-foreground/70"
          suppressHydrationWarning
        >
          {formatRelativeTime(item.inserted_at)}
        </div>
      </div>
      {unread && (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
      )}
    </button>
  );
}

const KIND_ICONS: Record<
  NotificationKind,
  { Icon: typeof Receipt; tone: string }
> = {
  "refund-request-raised": {
    Icon: Receipt,
    tone: "text-amber-600 bg-amber-100 dark:bg-amber-900/30",
  },
  "refund-request-approved": {
    Icon: CheckCircle2,
    tone: "text-green-600 bg-green-100 dark:bg-green-900/30",
  },
  "refund-request-declined": {
    Icon: XCircle,
    tone: "text-red-600 bg-red-100 dark:bg-red-900/30",
  },
  "seat-claimed": {
    Icon: UsersRound,
    tone: "text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30",
  },
  "question-asked": {
    Icon: MessageSquare,
    tone: "text-blue-600 bg-blue-100 dark:bg-blue-900/30",
  },
  "reply-posted": {
    Icon: Reply,
    tone: "text-sky-600 bg-sky-100 dark:bg-sky-900/30",
  },
  "course-status-changed": {
    Icon: Shield,
    tone: "text-orange-600 bg-orange-100 dark:bg-orange-900/30",
  },
  "role-changed": {
    Icon: UserCog,
    tone: "text-purple-600 bg-purple-100 dark:bg-purple-900/30",
  },
};

function KindIcon({ kind }: { kind: NotificationKind }) {
  const { Icon, tone } = KIND_ICONS[kind];
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full",
        tone
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

function ActorAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
  return (
    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
      {initials}
    </span>
  );
}
