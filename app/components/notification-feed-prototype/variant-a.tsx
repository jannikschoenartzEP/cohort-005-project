// PROTOTYPE — throwaway. See feed-state.ts.
// Variant A: bell in the sidebar header, Knock-style popover feed anchored to it,
// incoming Notifications as sonner toasts (the app's existing toaster, bottom-right).
// Badge counts UNSEEN items (Knock's default); opening the popover marks all seen.
import { Bell, BellOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "~/lib/utils";
import { onIncoming, timeAgo, useFeed } from "./feed-state";
import { ActorAvatar, KindIcon } from "./kind-icon";

export const name = "Sidebar bell + popover, sonner toasts";

export function VariantABell() {
  const feed = useFeed();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return onIncoming((n) => {
      toast(n.title, {
        description: n.body,
        duration: 5000,
        action: {
          label: "View",
          onClick: () => {
            feed.markRead(n.id);
            navigate(n.url);
          },
        },
      });
    });
  }, [feed.markRead, navigate]);

  useEffect(() => {
    if (!open) return;
    feed.markAllSeen();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, feed.markAllSeen, feed.items.length]);

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        className={cn(
          "relative rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          open && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <Bell className="size-4" />
        {feed.unseenCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {feed.unseenCount > 9 ? "9+" : feed.unseenCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full top-0 z-40 ml-3 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {feed.unreadCount > 0 && (
              <button onClick={feed.markAllRead} className="text-xs font-medium text-primary hover:underline">
                Mark all as read
              </button>
            )}
          </div>

          {feed.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <BellOff className="size-8 text-muted-foreground/50" />
              <div className="text-sm font-medium">You're all caught up</div>
              <div className="text-xs text-muted-foreground">
                Notifications about your courses and Refund Requests show up here.
              </div>
            </div>
          ) : (
            <ul className="max-h-[28rem] divide-y overflow-y-auto">
              {feed.items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      feed.markRead(n.id);
                      setOpen(false);
                      navigate(n.url);
                    }}
                    className={cn(
                      "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent",
                      !n.readAt && "bg-primary/5"
                    )}
                  >
                    {n.actorName ? <ActorAvatar name={n.actorName} /> : <KindIcon kind={n.kind} />}
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-sm", !n.readAt ? "font-semibold" : "text-muted-foreground")}>
                        {n.title}
                      </div>
                      {n.body && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}
                      <div className="mt-1 text-[11px] text-muted-foreground/70">{timeAgo(n.createdAt)}</div>
                    </div>
                    {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t px-4 py-2 text-center text-[10px] text-muted-foreground/60">
            (Knock Free may show “Powered by Knock” here)
          </div>
        </div>
      )}
    </div>
  );
}
