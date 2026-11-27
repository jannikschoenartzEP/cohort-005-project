import { count, countDistinct, desc, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  CourseStatus,
  categories,
  courses,
  lessons,
  modules,
  users,
} from "~/db/schema";

// ─── Landing ───
// What the landing page shows: one spotlighted course with its outline, the
// next few courses as cards, and a handful of catalogue-wide figures. Only
// published courses count anywhere on the page.

export type Db = BetterSQLite3Database<typeof schema>;

const FEATURED_COUNT = 3;
const OUTLINE_LENGTH = 4;

export type LandingCourse = {
  id: number;
  title: string;
  slug: string;
  description: string;
  coverImageUrl: string | null;
  instructorName: string;
  categoryName: string;
  lessonCount: number;
};

export type SpotlightCourse = LandingCourse & {
  moduleCount: number;
  outline: string[];
};

export type CatalogueStats = {
  courses: number;
  lessons: number;
  instructors: number;
  categories: number;
};

export type Landing = {
  spotlight: SpotlightCourse | null;
  featured: LandingCourse[];
  stats: CatalogueStats;
};

const isPublished = eq(courses.status, CourseStatus.Published);

function newestCourses(db: Db, limit: number) {
  return db
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      description: courses.description,
      coverImageUrl: courses.coverImageUrl,
      instructorName: users.name,
      categoryName: categories.name,
    })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .innerJoin(categories, eq(courses.categoryId, categories.id))
    .where(isPublished)
    .orderBy(desc(courses.createdAt), desc(courses.id))
    .limit(limit)
    .all();
}

function lessonCounts(db: Db, courseIds: number[]) {
  const rows = db
    .select({ courseId: modules.courseId, lessons: count(lessons.id) })
    .from(modules)
    .innerJoin(lessons, eq(lessons.moduleId, modules.id))
    .where(inArray(modules.courseId, courseIds))
    .groupBy(modules.courseId)
    .all();
  return new Map(rows.map((row) => [row.courseId, row.lessons]));
}

function courseOutline(db: Db, courseId: number) {
  return db
    .select({ title: modules.title })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .orderBy(modules.position, modules.id)
    .all()
    .map((row) => row.title);
}

function catalogueStats(db: Db): CatalogueStats {
  // An aggregate without GROUP BY always returns exactly one row.
  const [stats] = db
    .select({
      courses: countDistinct(courses.id),
      lessons: count(lessons.id),
      instructors: countDistinct(courses.instructorId),
      categories: countDistinct(courses.categoryId),
    })
    .from(courses)
    .leftJoin(modules, eq(modules.courseId, courses.id))
    .leftJoin(lessons, eq(lessons.moduleId, modules.id))
    .where(isPublished)
    .all();
  return stats;
}

export function getLanding(db: Db): Landing {
  const newest = newestCourses(db, FEATURED_COUNT + 1);
  const counts = lessonCounts(
    db,
    newest.map((course) => course.id)
  );
  const withLessons = newest.map((course) => ({
    ...course,
    lessonCount: counts.get(course.id) ?? 0,
  }));
  const [first, ...rest] = withLessons;
  const spotlight = first ? spotlightFor(db, first) : null;
  return { spotlight, featured: rest, stats: catalogueStats(db) };
}

function spotlightFor(db: Db, course: LandingCourse): SpotlightCourse {
  const outline = courseOutline(db, course.id);
  return {
    ...course,
    moduleCount: outline.length,
    outline: outline.slice(0, OUTLINE_LENGTH),
  };
}
