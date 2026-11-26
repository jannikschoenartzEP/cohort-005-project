import { useState } from "react";
import { useFetcher } from "react-router";
import { Lock, NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatRelativeTime } from "~/lib/utils";
import { noteDraft, type NoteDraftStatus } from "~/modules/lesson-notes";

export type LessonNoteProps = {
  note: { body: string; updatedAt: string } | null;
};

/**
 * The Student's private Note on the Lesson. Styled as a sibling of the
 * Questions & Discussion card below it, so the two read as one section.
 * Mount it with `key={lessonId}`: the draft is local state, and moving to
 * another Lesson must start from that Lesson's Note.
 */
export function LessonNote({ note }: LessonNoteProps) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [body, setBody] = useState(note?.body ?? "");
  const isSaving = fetcher.state !== "idle";
  const error = fetcher.data?.error;
  const draft = noteDraft(body, note?.body ?? null);

  return (
    <Card className="mb-8">
      <CardContent>
        <LessonNoteHeader />

        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Jot down what you want to remember from this lesson..."
            aria-label="Your notes"
            className="min-h-32 resize-y"
          />
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={isSaving || !draft.canSave}
            >
              {isSaving ? "Saving..." : "Save note"}
            </Button>
            <NoteStatus
              error={error}
              status={draft.status}
              updatedAt={note?.updatedAt}
            />
            <span
              className={cn(
                "ml-auto text-xs",
                draft.status === "too-long"
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}
            >
              {draft.counter}
            </span>
          </div>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function LessonNoteHeader() {
  return (
    <>
      <div className="mb-1 flex items-center gap-2">
        <NotebookPen className="size-5 text-primary" />
        <h2 className="text-xl font-semibold">Your notes</h2>
      </div>
      <p className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Lock className="size-3.5" />
        Private to you. Your instructor and other students can&apos;t see them.
      </p>
    </>
  );
}

function NoteStatus({
  error,
  status,
  updatedAt,
}: {
  error: string | undefined;
  status: NoteDraftStatus;
  updatedAt: string | undefined;
}) {
  if (error) {
    return <span className="text-sm text-destructive">{error}</span>;
  }
  if (status === "unsaved") {
    return (
      <span className="text-xs text-muted-foreground">Unsaved changes</span>
    );
  }
  if (status === "saved" && updatedAt) {
    return (
      <span suppressHydrationWarning className="text-xs text-muted-foreground">
        Saved {formatRelativeTime(updatedAt)}
      </span>
    );
  }
  return null;
}
