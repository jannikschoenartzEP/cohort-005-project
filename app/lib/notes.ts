import { z } from "zod";

export const MAX_NOTE_LENGTH = 2000;

/**
 * A Note body as typed into the note box: plain text, trimmed, refused (not
 * truncated) past MAX_NOTE_LENGTH. An empty body clears the Note.
 */
export const noteBodySchema = z
  .string()
  .trim()
  .max(
    MAX_NOTE_LENGTH,
    `A note can be at most ${MAX_NOTE_LENGTH.toLocaleString("en-US")} characters.`
  );
