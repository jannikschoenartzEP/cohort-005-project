import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  saveNote,
  toggleBookmark,
} from "./bookmarks-and-notes.server";
import { MAX_NOTE_LENGTH } from "./notes";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function minutesAfter(minutes: number) {
  return new Date(NOW.getTime() + minutes * 60_000);
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

describe("bookmarking a Lesson", () => {
  it("bookmarks an unbookmarked Lesson, and removes the Bookmark on the next toggle", () => {
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(false);

    expect(toggleBookmark(db, base.user.id, lessonIds[0], NOW)).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);

    expect(toggleBookmark(db, base.user.id, lessonIds[0], NOW)).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(false);
  });

  it("never leaves a Student with two Bookmarks on one Lesson", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);

    expect(() =>
      db
        .insert(schema.bookmarks)
        .values({ userId: base.user.id, lessonId: lessonIds[0] })
        .run()
    ).toThrow();
    expect(listBookmarks(db, base.user.id)).toHaveLength(1);
  });
});

describe("saving a Note", () => {
  it("creates a Note with the body trimmed", () => {
    const result = saveNote(db, base.user.id, lessonIds[0], "  # not a heading  ", NOW);

    expect(result).toEqual({
      ok: true,
      note: { body: "# not a heading", updatedAt: NOW.toISOString() },
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "# not a heading",
      updatedAt: NOW.toISOString(),
    });
  });

  it("replaces the body and moves the last-edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "First thought", NOW);
    saveNote(db, base.user.id, lessonIds[0], "Second thought", minutesAfter(5));

    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Second thought",
      updatedAt: minutesAfter(5).toISOString(),
    });
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("clears the Note when saved empty", () => {
    saveNote(db, base.user.id, lessonIds[0], "Something", NOW);

    expect(saveNote(db, base.user.id, lessonIds[0], "   ", NOW)).toEqual({
      ok: true,
      note: null,
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });

  it(`accepts a Note of exactly ${MAX_NOTE_LENGTH} characters`, () => {
    const body = "a".repeat(MAX_NOTE_LENGTH);

    expect(saveNote(db, base.user.id, lessonIds[0], body, NOW)).toMatchObject({
      ok: true,
      note: { body },
    });
  });

  it(`refuses a Note over ${MAX_NOTE_LENGTH} characters, keeping the old one`, () => {
    saveNote(db, base.user.id, lessonIds[0], "Keep me", NOW);

    expect(
      saveNote(db, base.user.id, lessonIds[0], "a".repeat(MAX_NOTE_LENGTH + 1), NOW)
    ).toEqual({ ok: false, error: "A note can be at most 2,000 characters." });
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("Keep me");
  });
});

describe("the Saved lists", () => {
  it("list only the Student's own Bookmarks, newest first, with their Lesson and Course", () => {
    const other = addStudent("Olive");
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[2], minutesAfter(1));
    toggleBookmark(db, other.id, lessonIds[1], minutesAfter(2));

    expect(listBookmarks(db, base.user.id)).toEqual([
      expect.objectContaining({
        lessonId: lessonIds[2],
        lessonTitle: "Lesson 3",
        courseTitle: "Test Course",
        courseSlug: "test-course",
      }),
      expect.objectContaining({ lessonId: lessonIds[0], lessonTitle: "Lesson 1" }),
    ]);
  });

  it("list only the Student's own Notes, most recently edited first, with their Lesson and Course", () => {
    const other = addStudent("Olive");
    saveNote(db, base.user.id, lessonIds[0], "Older", NOW);
    saveNote(db, base.user.id, lessonIds[1], "Newer", minutesAfter(1));
    saveNote(db, other.id, lessonIds[2], "Not mine", minutesAfter(2));
    saveNote(db, base.user.id, lessonIds[0], "Older, edited", minutesAfter(3));

    expect(listNotes(db, base.user.id)).toEqual([
      expect.objectContaining({
        body: "Older, edited",
        lessonId: lessonIds[0],
        lessonTitle: "Lesson 1",
        courseTitle: "Test Course",
        courseSlug: "test-course",
      }),
      expect.objectContaining({ body: "Newer", lessonId: lessonIds[1] }),
    ]);
  });
});
