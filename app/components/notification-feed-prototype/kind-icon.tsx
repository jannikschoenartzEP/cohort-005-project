// PROTOTYPE — throwaway. See feed-state.ts.
import {
  CheckCircle2,
  MessageSquare,
  Receipt,
  Reply,
  Shield,
  UserCog,
  UsersRound,
  XCircle,
} from "lucide-react";
import { cn } from "~/lib/utils";
import type { NotificationKind } from "./feed-state";

const icons: Record<NotificationKind, { Icon: typeof Receipt; tone: string }> = {
  "refund-request-raised": { Icon: Receipt, tone: "text-amber-600 bg-amber-100 dark:bg-amber-900/30" },
  "refund-approved": { Icon: CheckCircle2, tone: "text-green-600 bg-green-100 dark:bg-green-900/30" },
  "refund-declined": { Icon: XCircle, tone: "text-red-600 bg-red-100 dark:bg-red-900/30" },
  "seat-claimed": { Icon: UsersRound, tone: "text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30" },
  "question-asked": { Icon: MessageSquare, tone: "text-blue-600 bg-blue-100 dark:bg-blue-900/30" },
  "reply-posted": { Icon: Reply, tone: "text-sky-600 bg-sky-100 dark:bg-sky-900/30" },
  "course-status-changed": { Icon: Shield, tone: "text-orange-600 bg-orange-100 dark:bg-orange-900/30" },
  "role-changed": { Icon: UserCog, tone: "text-purple-600 bg-purple-100 dark:bg-purple-900/30" },
};

export function KindIcon({ kind, className }: { kind: NotificationKind; className?: string }) {
  const { Icon, tone } = icons[kind];
  return (
    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full", tone, className)}>
      <Icon className="size-4" />
    </span>
  );
}

export function ActorAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
  return (
    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
      {initials}
    </span>
  );
}
