import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraftStatus = "empty" | "too-long" | "unsaved" | "saved";

export type NoteDraft = {
  status: NoteDraftStatus;
  canSave: boolean;
  counter: string;
};

// Measured the way saveNote measures it — trimmed — so the box never offers a
// Save the server would refuse.
export function describeDraft(
  draft: string,
  savedBody: string | null
): NoteDraft {
  const trimmed = draft.trim();
  const status = statusOf(trimmed, savedBody);

  return {
    status,
    canSave: status === "unsaved",
    counter: `${trimmed.length.toLocaleString("en")} / ${MAX_NOTE_LENGTH.toLocaleString("en")}`,
  };
}

function statusOf(trimmed: string, savedBody: string | null): NoteDraftStatus {
  if (trimmed.length > MAX_NOTE_LENGTH) return "too-long";
  if (trimmed.length === 0) return "empty";
  if (trimmed === savedBody) return "saved";
  return "unsaved";
}
