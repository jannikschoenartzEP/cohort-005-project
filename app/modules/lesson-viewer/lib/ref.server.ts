import type { CourseRef } from "~/modules/permissions/course-permissions.server";

/**
 * The course named by this route's slug, through this lesson. A lesson in
 * another course, or a malformed lesson id, counts as not found.
 */
export function lessonRef(params: {
  slug: string;
  lessonId: string;
}): CourseRef {
  return { slug: params.slug, lessonId: params.lessonId };
}
