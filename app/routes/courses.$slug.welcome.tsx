import { Form, Link, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/courses.$slug.welcome";
import { db } from "~/db";
import {
  courses,
  categories,
  users,
  modules,
  lessons,
  enrollments,
  ProgressChoice,
} from "~/db/schema";
import { chooseProgress, needsProgressChoice } from "~/lib/progress.server";
import { parseFormData, parseParams } from "~/lib/validation";
import { eq, and, or } from "drizzle-orm";
import { getCurrentUserId } from "~/lib/session";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { PartyPopper, MessageCircle, PlayCircle } from "lucide-react";
import { data } from "react-router";

function getCourseBySlug(slug: string) {
  return db.select().from(courses).where(eq(courses.slug, slug)).get();
}

function getCourseWithDetails(id: number) {
  const course = db
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      description: courses.description,
      salesCopy: courses.salesCopy,
      instructorId: courses.instructorId,
      categoryId: courses.categoryId,
      status: courses.status,
      coverImageUrl: courses.coverImageUrl,
      price: courses.price,
      pppEnabled: courses.pppEnabled,
      createdAt: courses.createdAt,
      updatedAt: courses.updatedAt,
      instructorName: users.name,
      instructorAvatarUrl: users.avatarUrl,
      instructorBio: users.bio,
      categoryName: categories.name,
    })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .innerJoin(categories, eq(courses.categoryId, categories.id))
    .where(eq(courses.id, id))
    .get();

  if (!course) return null;

  const courseModules = db
    .select()
    .from(modules)
    .where(eq(modules.courseId, id))
    .orderBy(modules.position)
    .all();

  const moduleIds = courseModules.map((m) => m.id);

  const courseLessons =
    moduleIds.length > 0
      ? db
          .select()
          .from(lessons)
          .where(or(...moduleIds.map((mid) => eq(lessons.moduleId, mid)))!)
          .orderBy(lessons.position)
          .all()
      : [];

  return {
    ...course,
    modules: courseModules.map((mod) => ({
      ...mod,
      lessons: courseLessons.filter((l) => l.moduleId === mod.id),
    })),
  };
}

function isUserEnrolled(userId: number, courseId: number) {
  const enrollment = db
    .select()
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();
  return !!enrollment;
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.course?.title ?? "Welcome";
  return [
    { title: `Welcome to ${title} — Cadence` },
    { name: "description", content: `You're enrolled in ${title}!` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const slug = params.slug;
  const course = getCourseBySlug(slug);

  if (!course) {
    throw data("Course not found.", { status: 404 });
  }

  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw redirect(`/courses/${slug}`);
  }

  if (!isUserEnrolled(currentUserId, course.id)) {
    throw redirect(`/courses/${slug}`);
  }

  const courseWithDetails = getCourseWithDetails(course.id);
  if (!courseWithDetails) {
    throw data("Course not found.", { status: 404 });
  }

  const discordInviteUrl = process.env.DISCORD_INVITE_URL || null;

  return {
    course: courseWithDetails,
    discordInviteUrl,
    askProgressChoice: needsProgressChoice(db, currentUserId, course.id),
  };
}

const welcomeParamsSchema = z.object({ slug: z.string().min(1) });

const progressChoiceSchema = z.object({
  progressChoice: z.nativeEnum(ProgressChoice),
});

export async function action({ params, request }: Route.ActionArgs) {
  const { slug } = parseParams(params, welcomeParamsSchema);
  const course = getCourseBySlug(slug);
  if (!course) {
    throw data("Course not found.", { status: 404 });
  }

  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  // Asked once: a learner who has already chosen can't change their mind here.
  if (!needsProgressChoice(db, currentUserId, course.id)) {
    throw redirect(`/courses/${slug}/welcome`);
  }

  const parsed = parseFormData(await request.formData(), progressChoiceSchema);
  if (!parsed.success) {
    throw data("Pick Continuing or Starting Over.", { status: 400 });
  }

  chooseProgress(db, currentUserId, course.id, parsed.data.progressChoice);
  throw redirect(`/courses/${slug}/welcome`);
}

export default function Welcome({ loaderData }: Route.ComponentProps) {
  const { course, discordInviteUrl, askProgressChoice } = loaderData;

  if (askProgressChoice) {
    return <ProgressChoicePrompt courseTitle={course.title} />;
  }

  const firstLessonId =
    course.modules.length > 0 && course.modules[0].lessons.length > 0
      ? course.modules[0].lessons[0].id
      : null;

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <Card>
        <CardContent className="p-8 text-center">
          <div className="mb-4 inline-flex size-16 items-center justify-center rounded-full bg-primary/10">
            <PartyPopper className="size-8 text-primary" />
          </div>

          <h1 className="mb-2 text-3xl font-bold">
            Welcome to {course.title}!
          </h1>
          <p className="mb-8 text-lg text-muted-foreground">
            You&apos;re officially enrolled. Here&apos;s how to get started.
          </p>

          <div className="space-y-4">
            {discordInviteUrl && (
              <a
                href={discordInviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full max-w-sm"
                >
                  <MessageCircle className="mr-2 size-5" />
                  Join the Discord Community
                </Button>
              </a>
            )}

            {firstLessonId ? (
              <Link to={`/courses/${course.slug}/lessons/${firstLessonId}`}>
                <Button size="lg" className="w-full max-w-sm">
                  <PlayCircle className="mr-2 size-5" />
                  Start Learning
                </Button>
              </Link>
            ) : (
              <Link to={`/courses/${course.slug}`}>
                <Button size="lg" className="w-full max-w-sm">
                  Go to Course
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProgressChoicePrompt({ courseTitle }: { courseTitle: string }) {
  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <Card>
        <CardContent className="p-8 text-center">
          <h1 className="mb-2 text-3xl font-bold">Welcome back to {courseTitle}!</h1>
          <p className="mb-8 text-lg text-muted-foreground">
            You've been here before. Pick up where you left off, or start over
            with a clean slate? You only get asked once.
          </p>
          <Form method="post" className="flex flex-col items-center gap-3">
            <Button
              size="lg"
              className="w-full max-w-sm"
              name="progressChoice"
              value={ProgressChoice.Continuing}
              autoFocus
            >
              Continue where I left off
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full max-w-sm"
              name="progressChoice"
              value={ProgressChoice.StartingOver}
            >
              Start over
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
