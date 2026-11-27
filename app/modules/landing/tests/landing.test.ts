import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import { markdown } from "~/lib/text";
import { createLanding } from "../index.server";

// ─── Fixtures ───
// The catalogue has no service that writes courses, modules and lessons, so
// rows go in directly. Kept in one place so a schema change touches only
// this block.

let db: TestDb;
let counter = 0;

beforeEach(() => {
  db = createTestDb();
  counter = 0;
});

function addInstructor(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
      role: UserRole.Instructor,
    })
    .returning()
    .get();
}

function addCategory(name: string) {
  return db
    .insert(schema.categories)
    .values({ name, slug: name.toLowerCase() })
    .returning()
    .get();
}

type CourseOptions = {
  instructorId: number;
  categoryId: number;
  createdAt: string;
  status?: CourseStatus;
  coverImageUrl?: string;
};

function addCourse(title: string, options: CourseOptions) {
  counter += 1;
  return db
    .insert(schema.courses)
    .values({
      title,
      slug: `course-${counter}`,
      description: `About ${title}`,
      salesCopy: markdown(title),
      instructorId: options.instructorId,
      categoryId: options.categoryId,
      status: options.status ?? CourseStatus.Published,
      coverImageUrl: options.coverImageUrl,
      createdAt: options.createdAt,
    })
    .returning()
    .get();
}

function addModule(courseId: number, title: string, position: number) {
  return db
    .insert(schema.modules)
    .values({ courseId, title, position })
    .returning()
    .get();
}

function addLessons(moduleId: number, howMany: number) {
  for (let position = 1; position <= howMany; position++) {
    db.insert(schema.lessons)
      .values({ moduleId, title: `Lesson ${position}`, position })
      .run();
  }
}

function day(n: number) {
  return `2026-01-${String(n).padStart(2, "0")}T12:00:00.000Z`;
}

function landing() {
  return createLanding(db).get();
}

// ─── Tests ───

describe("landing", () => {
  it("is empty when nothing is published", () => {
    const sam = addInstructor("Sam Teach");
    const web = addCategory("Web");
    addCourse("Draft", {
      instructorId: sam.id,
      categoryId: web.id,
      createdAt: day(1),
      status: CourseStatus.Draft,
    });

    expect(landing()).toEqual({
      spotlight: null,
      featured: [],
      stats: { courses: 0, lessons: 0, instructors: 0, categories: 0 },
    });
  });

  it("spotlights the newest published course and features the next three", () => {
    const sam = addInstructor("Sam Teach");
    const web = addCategory("Web");
    const at = { instructorId: sam.id, categoryId: web.id };
    addCourse("Oldest", { ...at, createdAt: day(1) });
    addCourse("Second", { ...at, createdAt: day(2) });
    addCourse("Third", { ...at, createdAt: day(3) });
    addCourse("Fourth", { ...at, createdAt: day(4) });
    addCourse("Newest", { ...at, createdAt: day(5) });
    addCourse("Unpublished", {
      ...at,
      createdAt: day(6),
      status: CourseStatus.Archived,
    });

    const { spotlight, featured } = landing();

    expect(spotlight?.title).toBe("Newest");
    expect(featured.map((course) => course.title)).toEqual([
      "Fourth",
      "Third",
      "Second",
    ]);
  });

  it("describes the spotlight with its instructor, category and outline", () => {
    const sam = addInstructor("Sam Teach");
    const web = addCategory("Web");
    const course = addCourse("Forms", {
      instructorId: sam.id,
      categoryId: web.id,
      createdAt: day(1),
      coverImageUrl: "/images/forms.svg",
    });
    const names = ["Intro", "Inputs", "Validation", "Submitting", "Wrap-up"];
    // Added out of order so the outline has to follow position, not id.
    const added = [...names.entries()].reverse().map(([index, name]) => {
      const module = addModule(course.id, name, index + 1);
      addLessons(module.id, 2);
      return module;
    });
    const idOf = (name: string) =>
      added.find((module) => module.title === name)?.id;

    expect(landing().spotlight).toEqual({
      id: course.id,
      title: "Forms",
      slug: course.slug,
      description: "About Forms",
      coverImageUrl: "/images/forms.svg",
      instructorName: "Sam Teach",
      categoryName: "Web",
      lessonCount: 10,
      moduleCount: 5,
      outline: ["Intro", "Inputs", "Validation", "Submitting"].map((title) => ({
        id: idOf(title),
        title,
      })),
    });
  });

  it("counts each featured course's lessons across all its modules", () => {
    const sam = addInstructor("Sam Teach");
    const web = addCategory("Web");
    const at = { instructorId: sam.id, categoryId: web.id };
    const withLessons = addCourse("With lessons", { ...at, createdAt: day(1) });
    addCourse("Without lessons", { ...at, createdAt: day(2) });
    addCourse("Spotlight", { ...at, createdAt: day(3) });
    addLessons(addModule(withLessons.id, "One", 1).id, 3);
    addLessons(addModule(withLessons.id, "Two", 2).id, 4);

    const counts = landing().featured.map((course) => [
      course.title,
      course.lessonCount,
    ]);

    expect(counts).toEqual([
      ["Without lessons", 0],
      ["With lessons", 7],
    ]);
  });

  it("counts only published courses, and their lessons, instructors and categories", () => {
    const sam = addInstructor("Sam Teach");
    const kim = addInstructor("Kim Coach");
    const drafter = addInstructor("Dee Draft");
    const web = addCategory("Web");
    const data = addCategory("Data");
    const unused = addCategory("Unused");
    const a = addCourse("A", {
      instructorId: sam.id,
      categoryId: web.id,
      createdAt: day(1),
    });
    const b = addCourse("B", {
      instructorId: sam.id,
      categoryId: data.id,
      createdAt: day(2),
    });
    addCourse("C", {
      instructorId: kim.id,
      categoryId: web.id,
      createdAt: day(3),
    });
    const draft = addCourse("Draft", {
      instructorId: drafter.id,
      categoryId: unused.id,
      createdAt: day(4),
      status: CourseStatus.Draft,
    });
    addLessons(addModule(a.id, "A1", 1).id, 2);
    addLessons(addModule(b.id, "B1", 1).id, 3);
    addLessons(addModule(draft.id, "D1", 1).id, 5);

    expect(landing().stats).toEqual({
      courses: 3,
      lessons: 5,
      instructors: 2,
      categories: 2,
    });
  });
});
