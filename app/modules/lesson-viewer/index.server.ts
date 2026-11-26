import { loadLessonPage } from "./lib/load.server";
import { handleLessonAction } from "./lib/act.server";

type LessonParams = { slug: string; lessonId: string };

/**
 * Everything the Lesson page shows. Someone who cannot view the content gets
 * the locked view (title, module and outline only); anyone else gets the
 * full lesson. Throws a 404 for an unknown course or a lesson from another
 * course.
 */
export function getLessonPage(request: Request, params: LessonParams) {
  return loadLessonPage(request, params);
}

/**
 * Runs one Lesson page intent (comments, Bookmark, Note, progress, quiz),
 * checking the capability that intent needs first.
 */
export function runLessonIntent(request: Request, params: LessonParams) {
  return handleLessonAction(request, params);
}
