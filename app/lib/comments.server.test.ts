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
});
