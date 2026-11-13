import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { comments } from "~/db/schema";

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
  const comment = db
    .insert(comments)
    .values({
      userId: input.userId,
      lessonId: input.lessonId,
      parentId: input.parentId,
      body: input.body.trim(),
    })
    .returning()
    .get();

  return { success: true, comment };
}
