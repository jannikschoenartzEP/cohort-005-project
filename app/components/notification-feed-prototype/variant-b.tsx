// PROTOTYPE — throwaway. See feed-state.ts.
// Variant B: new top bar over the page with the bell on the right; the feed is a
// full-height slide-over drawer with Unread / All tabs and day groups.
// Incoming Notifications are our own toast cards, top-right under the bell,
// separate from the bottom-right confirmation toasts. Badge counts UNREAD.
import { Bell, Check, CheckCheck, Inbox, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { cn } from "~/lib/utils";
import { dayGroup, onIncoming, timeAgo, useFeed, type ProtoNotification } from "./feed-state";
import { KindIcon } from "./kind-icon";

export const name = "Top bar + slide-over drawer, top-right toast cards";

export function VariantBTopBar() {
  const feed = useFeed();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const navigate = useNavigate();

  const visible = tab === "unread" ? feed.items.filter((n) => !n.readAt) : feed.items;
  const groups = (["Today", "This week", "Earlier"] as const)
    .map((g) => [g, visible.filter((n) => dayGroup(n.createdAt) === g)] as const)
    .filter(([, list]) => list.length > 0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function go(n: ProtoNotification) {
    feed.markRead(n.id);
    setOpen(false);
    navigate(n.url);
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b px-6">
        <button
          onClick={() => setOpen(true)}
          className="relative flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Bell className="size-4" />
          {feed.unreadCount > 0 ? (
            <span className="rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
              {feed.unreadCount}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">0</span>
          )}
        </button>
      </header>

      <ToastStack onOpen={go} />

      {open && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute right-0 top-0 flex h-full w-[26rem] flex-col border-l bg-background shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="text-lg font-semibold">Notifications</h2>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex items-center justify-between border-b px-5 pt-3">
              <div className="flex gap-4 text-sm">
                {(["unread", "all"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cn(
                      "-mb-px border-b-2 pb-2 capitalize",
                      tab === t ? "border-primary font-semibold" : "border-transparent text-muted-foreground"
                    )}
                  >
                    {t}
                    {t === "unread" && feed.unreadCount > 0 && ` (${feed.unreadCount})`}
                  </button>
                ))}
              </div>
              {feed.unreadCount > 0 && (
                <button
                  onClick={feed.markAllRead}
                  className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck className="size-3.5" /> Mark all read
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2">
              {groups.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <Inbox className="size-10 text-muted-foreground/40" />
                  <div className="font-medium">
                    {tab === "unread" ? "Nothing unread" : "No Notifications yet"}
                  </div>
                  <div className="max-w-60 text-sm text-muted-foreground">
                    {tab === "unread"
                      ? "You've read everything."
                      : "When something happens that concerns you — a Reply, a Refund decision — it shows up here."}
                  </div>
                  {tab === "unread" && feed.items.length > 0 && (
                    <button onClick={() => setTab("all")} className="mt-2 text-sm text-primary hover:underline">
                      See all Notifications
                    </button>
                  )}
                </div>
              ) : (
                groups.map(([g, list]) => (
                  <section key={g} className="mb-3">
                    <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {g}
                    </div>
                    {list.map((n) => (
                      <div
                        key={n.id}
                        className="group relative flex cursor-pointer gap-3 rounded-lg p-2 hover:bg-accent"
                        onClick={() => go(n)}
                      >
                        <KindIcon kind={n.kind} />
                        <div className="min-w-0 flex-1 pr-6">
                          <div className={cn("text-sm", !n.readAt && "font-semibold")}>{n.title}</div>
                          {n.body && <div className="truncate text-xs text-muted-foreground">{n.body}</div>}
                          <div className="text-[11px] text-muted-foreground/70">{timeAgo(n.createdAt)}</div>
                        </div>
                        <button
                          title={n.readAt ? "Mark as unread" : "Mark as read"}
                          onClick={(e) => {
                            e.stopPropagation();
                            n.readAt ? feed.markUnread(n.id) : feed.markRead(n.id);
                          }}
                          className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 hover:bg-background group-hover:opacity-100"
                        >
                          {n.readAt ? <Undo2 className="size-3.5" /> : <Check className="size-3.5" />}
                        </button>
                      </div>
                    ))}
                  </section>
                ))
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function ToastStack({ onOpen }: { onOpen: (n: ProtoNotification) => void }) {
  const [toasts, setToasts] = useState<ProtoNotification[]>([]);
  const hovered = useRef(false);

  useEffect(() => onIncoming((n) => setToasts((t) => [n, ...t].slice(0, 3))), []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const id = setInterval(() => {
      if (hovered.current) return;
      setToasts((t) => t.filter((n) => Date.now() - n.createdAt < 8000));
    }, 500);
    return () => clearInterval(id);
  }, [toasts.length]);

  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed right-4 top-16 z-30 flex w-80 flex-col gap-2"
      onMouseEnter={() => (hovered.current = true)}
      onMouseLeave={() => (hovered.current = false)}
    >
      {toasts.map((n) => (
        <div
          key={n.id}
          className="flex animate-in slide-in-from-right gap-3 rounded-lg border bg-background p-3 shadow-lg"
        >
          <KindIcon kind={n.kind} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{n.title}</div>
            {n.body && <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}
            <button
              onClick={() => {
                setToasts((t) => t.filter((x) => x.id !== n.id));
                onOpen(n);
              }}
              className="mt-1 text-xs font-medium text-primary hover:underline"
            >
              View
            </button>
          </div>
          <button
            onClick={() => setToasts((t) => t.filter((x) => x.id !== n.id))}
            className="self-start rounded p-0.5 text-muted-foreground hover:bg-accent"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
