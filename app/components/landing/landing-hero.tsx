import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import type { CatalogueStats, SpotlightCourse } from "~/modules/landing";
import { SpotlightCard } from "./spotlight-card";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function HeroStats({ stats }: { stats: CatalogueStats }) {
  const figures = [
    { label: "Courses", value: stats.courses },
    { label: "Lessons", value: stats.lessons },
    { label: "Categories", value: stats.categories },
  ];
  return (
    <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-border pt-6">
      {figures.map((figure) => (
        <div key={figure.label}>
          <dt className="text-sm text-muted-foreground">{figure.label}</dt>
          <dd className="mt-1 text-3xl font-bold tracking-tight">
            {figure.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function HeroActions({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="mt-10 flex flex-wrap items-center gap-4">
      <Button asChild size="lg">
        <Link to="/courses">
          Browse Courses
          <ArrowRight className="ml-2 size-4" />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        {signedIn ? (
          <Link to="/dashboard">Go to Dashboard</Link>
        ) : (
          <Link to="/signup">Create a free account</Link>
        )}
      </Button>
    </div>
  );
}

export function LandingHero({
  stats,
  spotlight,
  signedIn,
}: {
  stats: CatalogueStats;
  spotlight: SpotlightCourse | null;
  signedIn: boolean;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 size-[36rem] rounded-full bg-primary/5 blur-3xl"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-6 py-20 lg:grid-cols-[1.1fr_1fr] lg:py-28">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            {plural(stats.courses, "course", "courses")} from{" "}
            {plural(stats.instructors, "instructor", "instructors")}
          </p>
          <h1 className="mt-6 text-5xl font-bold tracking-tight sm:text-6xl">
            Learn to code,
            <br />
            <span className="text-muted-foreground">at your own pace</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Structured courses built by experienced instructors. Track your
            progress, take quizzes, and build real-world skills.
          </p>
          <HeroActions signedIn={signedIn} />
          <HeroStats stats={stats} />
        </div>
        {spotlight && <SpotlightCard course={spotlight} />}
      </div>
    </section>
  );
}
