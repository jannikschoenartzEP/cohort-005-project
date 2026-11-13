export const MIN_COMMENT_LENGTH = 1;
export const MAX_COMMENT_LENGTH = 5000;

/** The element id a Comment renders with on the lesson page, for #-links. */
export function commentAnchor(commentId: number): string {
  return `comment-${commentId}`;
}
