import type { Db } from "~/db";
import { comments, courses, lessons, modules, users } from "~/db/schema";
import { eq } from "drizzle-orm";
import type { Notification, NotificationPerson } from "~/lib/notifications";
import {
  MAX_COMMENT_LENGTH,
  MIN_COMMENT_LENGTH,
  commentAnchor,
} from "./comments";

export type Comment = typeof comments.$inferSelect;

export type CreateCommentResult =
  | { ok: true; comment: Comment; notifications: Notification[] }
  | { ok: false; error: string };

/**
 * Creates a Comment on a lesson, or a Reply when `parentId` is set, and
 * returns the Notifications it causes: a Question asked for the course's
 * Instructor, or a Reply posted for the parent Comment's author. Nobody is
 * notified about their own Comment.
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
    return { ok: false, error: "Comment cannot be empty" };
  }
  if (body.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      error: `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`,
    };
  }

  const lesson = db
    .select({
      id: lessons.id,
      title: lessons.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      instructorId: courses.instructorId,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, input.lessonId))
    .get();
  if (!lesson) {
    return { ok: false, error: "Lesson not found" };
  }

  let parent: Comment | undefined;
  if (input.parentId !== null) {
    parent = db
      .select()
      .from(comments)
      .where(eq(comments.id, input.parentId))
      .get();
    if (!parent) {
      return { ok: false, error: "Parent comment not found" };
    }
    if (parent.lessonId !== input.lessonId) {
      return {
        ok: false,
        error: "Parent comment belongs to a different lesson",
      };
    }
    if (parent.parentId !== null) {
      return { ok: false, error: "Replies can only be one level deep" };
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

  const author = getUser(db, comment.userId);
  const notifications: Notification[] = [];
  if (!parent) {
    if (lesson.instructorId !== author.id) {
      notifications.push({
        kind: "question-asked",
        recipient: personOf(getUser(db, lesson.instructorId)),
        actor: personOf(author),
        title: `New question on ${lesson.title} in ${lesson.courseTitle}`,
        body: preview(comment.body),
        link: "/instructor/questions",
      });
    }
  } else if (parent.userId !== author.id) {
    notifications.push({
      kind: "reply-posted",
      recipient: personOf(getUser(db, parent.userId)),
      actor: personOf(author),
      title: `${author.name} replied to your comment on ${lesson.title}`,
      body: preview(comment.body),
      link: `/courses/${lesson.courseSlug}/lessons/${lesson.id}#${commentAnchor(comment.id)}`,
    });
  }

  return { ok: true, comment, notifications };
}

type User = typeof users.$inferSelect;

function getUser(db: Db, userId: number): User {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new Error(`User ${userId} not found`);
  return user;
}

function personOf(user: User): NotificationPerson {
  return { id: user.id, name: user.name, email: user.email };
}

const PREVIEW_LENGTH = 140;

/** A Notification shows only the start of a Comment. */
function preview(body: string): string {
  if (body.length <= PREVIEW_LENGTH) return body;
  return `${body.slice(0, PREVIEW_LENGTH).trimEnd()}…`;
}
