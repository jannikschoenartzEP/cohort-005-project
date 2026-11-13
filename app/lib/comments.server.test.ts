import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { createComment } from "./comments.server";

type TestDb = ReturnType<typeof createTestDb>;

function seedLesson(testDb: TestDb, courseId: number, title: string) {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId, title: `${title} module`, position: 1 })
    .returning()
    .get();
  return testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title, position: 1 })
    .returning()
    .get();
}

describe("createComment", () => {
  let testDb: TestDb;
  let base: ReturnType<typeof seedBaseData>;
  let lesson: ReturnType<typeof seedLesson>;

  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
    lesson = seedLesson(testDb, base.course.id, "Intro");
  });

  it("creates a top-level Comment with a trimmed body", () => {
    const result = createComment(testDb, {
      userId: base.user.id,
      lessonId: lesson.id,
      parentId: null,
      body: "  How does this work?  ",
    });

    expect(result).toMatchObject({
      ok: true,
      comment: {
        userId: base.user.id,
        lessonId: lesson.id,
        parentId: null,
        body: "How does this work?",
      },
    });
  });

  it("rejects a body that is only whitespace", () => {
    const result = createComment(testDb, {
      userId: base.user.id,
      lessonId: lesson.id,
      parentId: null,
      body: "   ",
    });

    expect(result).toEqual({
      ok: false,
      error: "Comment cannot be empty",
    });
  });

  it("rejects a body longer than 5000 characters", () => {
    const result = createComment(testDb, {
      userId: base.user.id,
      lessonId: lesson.id,
      parentId: null,
      body: "a".repeat(5001),
    });

    expect(result).toEqual({
      ok: false,
      error: "Comment must be 5000 characters or fewer",
    });
  });

  it("accepts a body of exactly 5000 characters", () => {
    const result = createComment(testDb, {
      userId: base.user.id,
      lessonId: lesson.id,
      parentId: null,
      body: "a".repeat(5000),
    });

    expect(result.ok).toBe(true);
  });

  it("rejects a Comment on a lesson that does not exist", () => {
    const result = createComment(testDb, {
      userId: base.user.id,
      lessonId: 9999,
      parentId: null,
      body: "Hello?",
    });

    expect(result).toEqual({ ok: false, error: "Lesson not found" });
  });

  describe("Replies", () => {
    function postQuestion(lessonId: number) {
      const result = createComment(testDb, {
        userId: base.user.id,
        lessonId,
        parentId: null,
        body: "A question",
      });
      if (!result.ok) throw new Error(result.error);
      return result.comment;
    }

    it("creates a Reply to a top-level Comment", () => {
      const question = postQuestion(lesson.id);

      const result = createComment(testDb, {
        userId: base.instructor.id,
        lessonId: lesson.id,
        parentId: question.id,
        body: "An answer",
      });

      expect(result).toMatchObject({
        ok: true,
        comment: {
          userId: base.instructor.id,
          lessonId: lesson.id,
          parentId: question.id,
          body: "An answer",
        },
      });
    });

    it("rejects a Reply whose parent is on a different lesson", () => {
      const otherLesson = seedLesson(testDb, base.course.id, "Other");
      const question = postQuestion(otherLesson.id);

      const result = createComment(testDb, {
        userId: base.instructor.id,
        lessonId: lesson.id,
        parentId: question.id,
        body: "An answer",
      });

      expect(result).toEqual({
        ok: false,
        error: "Parent comment belongs to a different lesson",
      });
    });

    it("rejects a Reply to a Reply", () => {
      const question = postQuestion(lesson.id);
      const reply = createComment(testDb, {
        userId: base.instructor.id,
        lessonId: lesson.id,
        parentId: question.id,
        body: "An answer",
      });
      if (!reply.ok) throw new Error(reply.error);

      const result = createComment(testDb, {
        userId: base.user.id,
        lessonId: lesson.id,
        parentId: reply.comment.id,
        body: "Thanks!",
      });

      expect(result).toEqual({
        ok: false,
        error: "Replies can only be one level deep",
      });
    });

    it("rejects a Reply to a Comment that does not exist", () => {
      const result = createComment(testDb, {
        userId: base.user.id,
        lessonId: lesson.id,
        parentId: 9999,
        body: "Thanks!",
      });

      expect(result).toEqual({
        ok: false,
        error: "Parent comment not found",
      });
    });
  });

  describe("Notifications", () => {
    it("notifies the course's Instructor of a new Question", () => {
      const result = createComment(testDb, {
        userId: base.user.id,
        lessonId: lesson.id,
        parentId: null,
        body: "How does this work?",
      });

      expect(result).toMatchObject({
        ok: true,
        notifications: [
          {
            kind: "question-asked",
            recipient: {
              id: base.instructor.id,
              name: "Test Instructor",
              email: "instructor@example.com",
            },
            actor: {
              id: base.user.id,
              name: "Test User",
              email: "test@example.com",
            },
            title: "New question on Intro in Test Course",
            body: "How does this work?",
            link: "/instructor/questions",
          },
        ],
      });
    });

    it("does not notify the Instructor of their own Question", () => {
      const result = createComment(testDb, {
        userId: base.instructor.id,
        lessonId: lesson.id,
        parentId: null,
        body: "Pinned: read the notes first",
      });

      expect(result).toMatchObject({ ok: true, notifications: [] });
    });

    it("notifies the Question's author of a Reply, linking to the Reply", () => {
      const question = createComment(testDb, {
        userId: base.user.id,
        lessonId: lesson.id,
        parentId: null,
        body: "How does this work?",
      });
      if (!question.ok) throw new Error(question.error);

      const result = createComment(testDb, {
        userId: base.instructor.id,
        lessonId: lesson.id,
        parentId: question.comment.id,
        body: "Like this.",
      });
      if (!result.ok) throw new Error(result.error);

      expect(result.notifications).toEqual([
        {
          kind: "reply-posted",
          recipient: {
            id: base.user.id,
            name: "Test User",
            email: "test@example.com",
          },
          actor: {
            id: base.instructor.id,
            name: "Test Instructor",
            email: "instructor@example.com",
          },
          title: "Test Instructor replied to your comment on Intro",
          body: "Like this.",
          link: `/courses/test-course/lessons/${lesson.id}#comment-${result.comment.id}`,
        },
      ]);
    });

    it("sends nothing when you reply to your own Comment", () => {
      const question = createComment(testDb, {
        userId: base.user.id,
        lessonId: lesson.id,
        parentId: null,
        body: "How does this work?",
      });
      if (!question.ok) throw new Error(question.error);

      const result = createComment(testDb, {
        userId: base.user.id,
        lessonId: lesson.id,
        parentId: question.comment.id,
        body: "Never mind, figured it out.",
      });

      expect(result).toMatchObject({ ok: true, notifications: [] });
    });

    it("shows only the first 140 characters of a long Comment", () => {
      const sentence = "This lesson's second example confuses me. ";
      const result = createComment(testDb, {
        userId: base.user.id,
        lessonId: lesson.id,
        parentId: null,
        body: sentence.repeat(5),
      });
      if (!result.ok) throw new Error(result.error);

      expect(result.notifications[0]?.body).toBe(
        "This lesson's second example confuses me. This lesson's second example confuses me. This lesson's second example confuses me. This lesson's…"
      );
    });

    it("shows a Comment of exactly 140 characters in full", () => {
      const result = createComment(testDb, {
        userId: base.user.id,
        lessonId: lesson.id,
        parentId: null,
        body: "a".repeat(140),
      });
      if (!result.ok) throw new Error(result.error);

      expect(result.notifications[0]?.body).toBe("a".repeat(140));
    });
  });
});
