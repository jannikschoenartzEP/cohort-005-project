import { useEffect, useState } from "react";
import { Link, data, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import type { Route } from "./+types/instructor.refunds";
import { requireInstructorOrAdmin } from "~/lib/access.server";
import {
  approveRefundRequest,
  declineInputSchema,
  declineRefundRequest,
  DECLINE_REASON_LABELS,
  listRefundRequests,
  markRefundFailed,
  markRefundIssued,
  retryRefund,
  type Email,
  type RefundRequestFilter,
} from "~/lib/refunds.server";
import { parseFormData } from "~/lib/validation";
import { db } from "~/db";
import { DeclineReason, RefundState, RefundStatus } from "~/db/schema";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatPrice, formatRelativeTime } from "~/lib/utils";

const FILTERS: { value: RefundRequestFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
];

const searchSchema = z.object({
  show: z.enum(["open", "approved", "declined"]).catch("open"),
});

const refundRequestIdSchema = z.coerce.number().int().positive();

const actionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("approve"), refundRequestId: refundRequestIdSchema }),
  z.object({ intent: z.literal("decline"), refundRequestId: refundRequestIdSchema }),
  z.object({ intent: z.literal("issue"), refundRequestId: refundRequestIdSchema }),
  z.object({
    intent: z.literal("fail"),
    refundRequestId: refundRequestIdSchema,
    note: z.string().trim().min(1, "Say why the Refund failed."),
  }),
  z.object({ intent: z.literal("retry"), refundRequestId: refundRequestIdSchema }),
]);

/** No mail transport yet, so learner emails go to the server log. */
function logEmail(email: Email) {
  console.log(`[email] to=${email.to} subject=${email.subject}\n${email.body}`);
}

export function meta() {
  return [{ title: "Refund Requests — Cadence" }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { user, isAdmin } = await requireInstructorOrAdmin(request);
  const { show } = searchSchema.parse({
    show: url.searchParams.get("show") ?? undefined,
  });

  return {
    show,
    isAdmin,
    requests: listRefundRequests(db, user, show),
    declineReasons: [
      ...Object.entries(DECLINE_REASON_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      { value: DeclineReason.Other, label: "Other" },
    ],
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { user } = await requireInstructorOrAdmin(request);
  const formData = await request.formData();
  const parsed = parseFormData(formData, actionSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  const { intent, refundRequestId } = parsed.data;

  switch (intent) {
    case "approve": {
      logEmail(approveRefundRequest(db, user, refundRequestId).email);
      break;
    }
    case "decline": {
      const decline = parseFormData(formData, declineInputSchema);
      if (!decline.success) {
        return data({ errors: decline.errors }, { status: 400 });
      }
      logEmail(
        declineRefundRequest(db, user, refundRequestId, decline.data).email
      );
      break;
    }
    case "issue": {
      markRefundIssued(db, user, refundRequestId);
      break;
    }
    case "fail": {
      logEmail(
        markRefundFailed(db, user, refundRequestId, parsed.data.note).email
      );
      break;
    }
    case "retry": {
      retryRefund(db, user, refundRequestId);
      break;
    }
  }

  return { errors: null };
}

type LoaderData = Route.ComponentProps["loaderData"];
type RefundRequestRow = LoaderData["requests"][number];
type ActionData = { errors: Record<string, string> | null };

const REFUND_STATE_LABELS: Record<RefundState, string> = {
  [RefundState.Pending]: "Pending Refund",
  [RefundState.Issued]: "Issued Refund",
  [RefundState.Failed]: "Failed Refund",
};

export default function RefundRequests({ loaderData }: Route.ComponentProps) {
  const { show, requests, isAdmin, declineReasons } = loaderData;

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <h1 className="mb-2 text-3xl font-bold">Refund Requests</h1>
      <p className="mb-6 text-muted-foreground">
        {isAdmin
          ? "Every course. Oldest open requests first."
          : "Your courses. Oldest open requests first."}
      </p>

      <nav className="mb-6 flex gap-2">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            to={`?show=${filter.value}`}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm",
              show === filter.value
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {requests.length === 0 ? (
        <p className="text-muted-foreground">Nothing here.</p>
      ) : (
        <div className="space-y-4">
          {requests.map((row) => (
            <RefundRequestCard
              key={row.id}
              row={row}
              isAdmin={isAdmin}
              declineReasons={declineReasons}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RefundRequestCard({
  row,
  isAdmin,
  declineReasons,
}: {
  row: RefundRequestRow;
  isAdmin: boolean;
  declineReasons: LoaderData["declineReasons"];
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <span className="font-semibold">{row.learnerName}</span>{" "}
            <span className="text-sm text-muted-foreground">
              {row.learnerEmail}
            </span>
          </div>
          <span className="text-sm font-medium">
            {formatPrice(row.amountPaid)}
          </span>
        </div>
        <div className="text-sm text-muted-foreground">
          <Link to={`/courses/${row.courseSlug}`} className="hover:underline">
            {row.courseTitle}
          </Link>{" "}
          · bought {new Date(row.purchasedAt).toLocaleDateString()} ·
          requested {formatRelativeTime(row.requestedAt)}
        </div>
        <div className="text-sm">{row.progressSummary}</div>
        <blockquote className="border-l-2 pl-3 text-sm italic">
          {row.reason}
        </blockquote>

        {row.status === RefundStatus.Open && (
          <DecideRefundRequest id={row.id} declineReasons={declineReasons} />
        )}

        {row.declineReasonLabel && (
          <p className="text-sm">
            <span className="font-medium">Declined:</span>{" "}
            {row.declineReasonLabel}
          </p>
        )}

        {row.refundState && (
          <CarryOutRefund
            id={row.id}
            state={row.refundState}
            failedNote={row.failedNote}
            isAdmin={isAdmin}
          />
        )}
      </CardContent>
    </Card>
  );
}

function useActionToast(fetcher: ReturnType<typeof useFetcher<ActionData>>) {
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.errors) return;
    const [first] = Object.values(fetcher.data.errors);
    if (first) toast.error(first);
  }, [fetcher.state, fetcher.data]);
}

function DecideRefundRequest({
  id,
  declineReasons,
}: {
  id: number;
  declineReasons: LoaderData["declineReasons"];
}) {
  const fetcher = useFetcher<ActionData>();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const busy = fetcher.state !== "idle";
  useActionToast(fetcher);

  if (!declining) {
    return (
      <div className="flex gap-2">
        <fetcher.Form
          method="post"
          onSubmit={(event) => {
            if (!confirm("Approve this request? The decision is final.")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="refundRequestId" value={id} />
          <Button name="intent" value="approve" disabled={busy}>
            Approve
          </Button>
        </fetcher.Form>
        <Button variant="outline" onClick={() => setDeclining(true)}>
          Decline…
        </Button>
      </div>
    );
  }

  return (
    <fetcher.Form method="post" className="space-y-2">
      <input type="hidden" name="refundRequestId" value={id} />
      <select
        name="declineReason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        required
      >
        <option value="" disabled>
          Pick a reason the learner will see
        </option>
        {declineReasons.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {reason === DeclineReason.Other && (
        <Textarea
          name="declineReasonText"
          placeholder="Tell the learner why"
          required
        />
      )}
      <div className="flex gap-2">
        <Button name="intent" value="decline" disabled={busy}>
          Decline
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setDeclining(false)}
        >
          Cancel
        </Button>
      </div>
    </fetcher.Form>
  );
}

function CarryOutRefund({
  id,
  state,
  failedNote,
  isAdmin,
}: {
  id: number;
  state: RefundState;
  failedNote: string | null;
  isAdmin: boolean;
}) {
  const fetcher = useFetcher<ActionData>();
  const busy = fetcher.state !== "idle";
  useActionToast(fetcher);

  return (
    <div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
      <div className="font-medium">{REFUND_STATE_LABELS[state]}</div>
      {failedNote && (
        <div className="text-muted-foreground">Internal note: {failedNote}</div>
      )}
      {isAdmin && state === RefundState.Pending && (
        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="refundRequestId" value={id} />
          <Button name="intent" value="issue" size="sm" disabled={busy}>
            Mark Issued
          </Button>
          <Textarea
            name="note"
            placeholder="Why the money couldn't be sent (internal, required to mark Failed)"
          />
          <Button
            name="intent"
            value="fail"
            size="sm"
            variant="outline"
            disabled={busy}
          >
            Mark Failed
          </Button>
        </fetcher.Form>
      )}
      {isAdmin && state === RefundState.Failed && (
        <fetcher.Form method="post">
          <input type="hidden" name="refundRequestId" value={id} />
          <Button name="intent" value="retry" size="sm" disabled={busy}>
            Retry
          </Button>
        </fetcher.Form>
      )}
    </div>
  );
}
