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
      success: true,
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
      success: false,
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
      success: false,
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

    expect(result.success).toBe(true);
  });

  it("rejects a Comment on a lesson that does not exist", () => {
    const result = createComment(testDb, {
      userId: base.user.id,
      lessonId: 9999,
      parentId: null,
      body: "Hello?",
    });

    expect(result).toEqual({ success: false, error: "Lesson not found" });
  });
});
