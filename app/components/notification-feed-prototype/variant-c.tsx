// PROTOTYPE — throwaway. See feed-state.ts.
// Variant C: "Inbox" is a sidebar nav item; it opens a docked panel between the
// sidebar and the page (pushes content, stays open while you click through).
// No popup toasts at all: an incoming Notification pulses the nav pill and slides
// into the panel with a "New" marker. Badge counts UNREAD.
import { Inbox, MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { cn } from "~/lib/utils";
import { onIncoming, timeAgo, useFeed } from "./feed-state";
import { KindIcon } from "./kind-icon";

export const name = "Sidebar Inbox item + docked panel, no popups";

// Panel open state shared between the nav item and the panel.
let panelOpen = false;
const panelListeners = new Set<() => void>();
function setPanelOpen(v: boolean) {
  panelOpen = v;
  panelListeners.forEach((l) => l());
}
function usePanelOpen() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    panelListeners.add(l);
    return () => {
      panelListeners.delete(l);
    };
  }, []);
  return panelOpen;
}

export function VariantCNavItem() {
  const feed = useFeed();
  const open = usePanelOpen();
  const [pulse, setPulse] = useState(false);

  useEffect(
    () =>
      onIncoming(() => {
        setPulse(true);
        setTimeout(() => setPulse(false), 2000);
      }),
    []
  );

  return (
    <button
      onClick={() => setPanelOpen(!open)}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        open
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Inbox className="size-4" />
      Inbox
      {feed.unreadCount > 0 && (
        <span
          className={cn(
            "ml-auto rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground transition-transform",
            pulse && "scale-125 animate-pulse"
          )}
        >
          {feed.unreadCount}
        </span>
      )}
    </button>
  );
}

export function VariantCPanel() {
  const feed = useFeed();
  const open = usePanelOpen();
  const navigate = useNavigate();
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(
    () =>
      onIncoming((n) => {
        setFresh((s) => new Set(s).add(n.id));
        setTimeout(
          () =>
            setFresh((s) => {
              const next = new Set(s);
              next.delete(n.id);
              return next;
            }),
          6000
        );
      }),
    []
  );

  if (!open) return null;
  return (
    <section className="flex h-screen w-80 shrink-0 flex-col border-r bg-background">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <span className="font-semibold">Inbox</span>
        <div className="flex items-center gap-1">
          {feed.unreadCount > 0 && (
            <button
              onClick={feed.markAllRead}
              title="Mark all read"
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <MailCheck className="size-4" />
            </button>
          )}
          <button
            onClick={() => setPanelOpen(false)}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            Close
          </button>
        </div>
      </div>

      {feed.items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
          <div className="text-3xl">🎉</div>
          <div className="text-sm font-medium">Inbox zero</div>
          <div className="text-xs text-muted-foreground">Nothing needs your attention.</div>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {feed.items.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => {
                  feed.markRead(n.id);
                  setActiveId(n.id);
                  navigate(n.url);
                }}
                className={cn(
                  "flex w-full items-start gap-2 border-l-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                  !n.readAt ? "border-primary" : "border-transparent",
                  activeId === n.id && "bg-accent",
                  fresh.has(n.id) && "animate-in slide-in-from-top bg-primary/10"
                )}
              >
                <KindIcon kind={n.kind} className="size-6 [&_svg]:size-3" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("truncate", !n.readAt ? "font-semibold" : "text-muted-foreground")}>
                      {n.title}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/70">
                      {fresh.has(n.id) ? (
                        <span className="rounded bg-primary px-1 font-semibold text-primary-foreground">New</span>
                      ) : (
                        timeAgo(n.createdAt)
                      )}
                    </span>
                  </div>
                  {n.body && <div className="truncate text-xs text-muted-foreground">{n.body}</div>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
