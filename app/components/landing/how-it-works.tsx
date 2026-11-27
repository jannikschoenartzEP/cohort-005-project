import { BookOpen, CircleCheck, ListChecks } from "lucide-react";

const STEPS = [
  {
    icon: BookOpen,
    title: "Pick a course",
    body: "Every course is split into modules and short lessons, so you always know what comes next.",
  },
  {
    icon: CircleCheck,
    title: "Learn lesson by lesson",
    body: "Your progress is saved as you go. Stop whenever you like and pick up where you left off.",
  },
  {
    icon: ListChecks,
    title: "Check what stuck",
    body: "Lesson quizzes show you what you have learned and what to revisit.",
  },
];

export function HowItWorks() {
  return (
    <section className="border-b border-border bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1fr_2fr]">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            How Cadence works
          </h2>
          <p className="mt-3 text-muted-foreground">
            No schedule to keep. Just a clear path through each course.
          </p>
        </div>
        <ol className="grid gap-8 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <step.icon className="size-5" />
                </span>
                <span className="text-sm font-semibold text-muted-foreground">
                  Step {index + 1}
                </span>
              </div>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
