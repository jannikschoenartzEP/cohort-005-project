import { Link } from "react-router";
import { ArrowRight, User } from "lucide-react";
import { CourseImage } from "~/components/course-image";
import { plural } from "~/lib/utils";
import type { OutlineModule, SpotlightCourse } from "~/modules/landing";

function CourseOutline({ outline }: { outline: OutlineModule[] }) {
  if (outline.length === 0) return null;
  return (
    <ol className="mt-5 space-y-2">
      {outline.map((module, index) => (
        <li key={module.id} className="flex items-center gap-3 text-sm">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            {index + 1}
          </span>
          <span className="truncate">{module.title}</span>
        </li>
      ))}
    </ol>
  );
}

export function SpotlightCard({ course }: { course: SpotlightCourse }) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute inset-0 translate-x-4 translate-y-4 rounded-xl border border-border bg-muted"
      />
      <Link
        to={`/courses/${course.slug}`}
        className="group relative block overflow-hidden rounded-xl border border-border bg-card shadow-lg transition-shadow hover:shadow-xl"
      >
        <div className="relative">
          <CourseImage
            src={course.coverImageUrl}
            alt={course.title}
            className="aspect-[2/1] w-full object-cover"
          />
          <span className="absolute top-3 left-3 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold">
            New on Cadence
          </span>
        </div>
        <div className="p-6">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {course.categoryName}
          </p>
          <h2 className="mt-1 text-xl font-semibold group-hover:text-primary">
            {course.title}
          </h2>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <User className="size-3.5" />
            {course.instructorName}
          </p>
          <CourseOutline outline={course.outline} />
          <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-sm">
            <span className="text-muted-foreground">
              {plural(course.moduleCount, "module", "modules")} ·{" "}
              {plural(course.lessonCount, "lesson", "lessons")}
            </span>
            <span className="flex items-center gap-1 font-medium">
              View course
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
