import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { comments, lessons } from "~/db/schema";
import { eq } from "drizzle-orm";
import { MAX_COMMENT_LENGTH, MIN_COMMENT_LENGTH } from "./comments";

type Db = BetterSQLite3Database<typeof schema>;

export type Comment = typeof comments.$inferSelect;

export type CreateCommentResult =
  | { success: true; comment: Comment }
  | { success: false; error: string };

/**
 * Creates a Comment on a lesson, or a Reply when `parentId` is set.
 */
export function createComment(
  db: Db,
  input: {
    userId: number;
    lessonId: number;
    parentId: number | null;
    body: string;
  }
): CreateCommentResult {
  const body = input.body.trim();
  if (body.length < MIN_COMMENT_LENGTH) {
    return { success: false, error: "Comment cannot be empty" };
  }
  if (body.length > MAX_COMMENT_LENGTH) {
    return {
      success: false,
      error: `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`,
    };
  }

  const lesson = db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.id, input.lessonId))
    .get();
  if (!lesson) {
    return { success: false, error: "Lesson not found" };
  }

  if (input.parentId !== null) {
    const parent = db
      .select()
      .from(comments)
      .where(eq(comments.id, input.parentId))
      .get();
    if (!parent) {
      return { success: false, error: "Parent comment not found" };
    }
    if (parent.lessonId !== input.lessonId) {
      return {
        success: false,
        error: "Parent comment belongs to a different lesson",
      };
    }
    if (parent.parentId !== null) {
      return { success: false, error: "Replies can only be one level deep" };
    }
  }

  const comment = db
    .insert(comments)
    .values({
      userId: input.userId,
      lessonId: input.lessonId,
      parentId: input.parentId,
      body,
    })
    .returning()
    .get();

  return { success: true, comment };
}
