// PROTOTYPE — throwaway. Switcher controls: fire a fake real-time Notification,
// swap feed fixtures, and show the feed state.
import { useEffect, useState } from "react";
import type { UserRole } from "~/db/schema";
import { PrototypeSwitcher } from "~/components/prototype-switcher";
import { fireIncoming, kindsForRole, resetFeed, useFeed, type FeedMode } from "./feed-state";
import * as A from "./variant-a";
import * as B from "./variant-b";
import * as C from "./variant-c";

export const VARIANTS = [
  { key: "A", name: A.name },
  { key: "B", name: B.name },
  { key: "C", name: C.name },
];

export function NotificationPrototypeControls({
  variant,
  role,
  isTeamAdmin,
}: {
  variant: string;
  role: UserRole | null;
  isTeamAdmin: boolean;
}) {
  const [mode, setMode] = useState<FeedMode>("normal");
  const feed = useFeed();

  useEffect(() => {
    resetFeed(kindsForRole(role, isTeamAdmin), mode);
  }, [role, isTeamAdmin, mode]);

  return (
    <PrototypeSwitcher variants={VARIANTS} current={variant}>
      <button
        onClick={fireIncoming}
        className="whitespace-nowrap rounded-full bg-fuchsia-600 px-3 py-1 text-xs font-semibold hover:bg-fuchsia-500"
      >
        ⚡ Fire Notification
      </button>
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as FeedMode)}
        className="rounded-full bg-white/10 px-2 py-1 text-xs"
      >
        <option value="normal">6 items</option>
        <option value="empty">empty</option>
        <option value="many">30 items</option>
      </select>
      <span className="whitespace-nowrap font-mono text-[11px] text-white/70">
        items {feed.items.length} · unread {feed.unreadCount} · unseen {feed.unseenCount}
      </span>
    </PrototypeSwitcher>
  );
}
