import { describeDraft, type NoteDraft } from "./lib/draft";

export type { NoteDraft, NoteDraftStatus } from "./lib/draft";

/**
 * What the Note box on the Lesson page should show for what the Student has
 * typed, given the body last saved (null before the first save): whether
 * Save is on, the status beside it, and the character counter.
 */
export function noteDraft(draft: string, savedBody: string | null): NoteDraft {
  return describeDraft(draft, savedBody);
}
