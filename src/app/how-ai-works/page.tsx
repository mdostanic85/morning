import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const STEPS = [
  {
    title: "Collect signals",
    description: "Tasks, meetings, comments, implementation evidence, and project documentation.",
  },
  {
    title: "Rank sources",
    description: "Recent direct instructions usually outrank older task states and baseline documents.",
  },
  {
    title: "Resolve conflicts",
    description: "The decisive source is shown while conflicting evidence remains visible.",
  },
  {
    title: "Create output",
    description: "Items become Urgent, Verify, Waiting, or Later without inventing missing context.",
  },
];

export default function HowAiWorksPage() {
  return (
    <div className="mx-auto w-full max-w-[77.5rem] py-8 pb-20">
      <nav className="flex items-center gap-2 text-sm font-medium text-muted">
        <Link href="/" className="text-accent-strong hover:underline">Today</Link>
        <span>/</span>
        <strong className="text-foreground">How AI works</strong>
      </nav>
      <header className="mt-7 grid gap-6 border-b border-border pb-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div>
          <h1 className="ft-screen-title max-w-4xl font-display">
            How today&apos;s output is created
          </h1>
          <p className="ft-screen-lead mt-4 max-w-3xl text-muted">
            AI ranks evidence, identifies conflicts, and reduces the result to the few items that need attention today.
          </p>
        </div>
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-[14px] border border-border-strong bg-surface px-4 text-sm font-semibold text-accent-strong">
          <ArrowLeft className="size-4" /> Back to today
        </Link>
      </header>
      <ol className="mt-7 grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="rounded-[18px] border border-border bg-surface p-[18px]">
            <span className="grid size-9 place-items-center rounded-xl bg-accent-soft-surface text-sm font-bold text-accent-strong">
              {index + 1}
            </span>
            <strong className="mt-4 block text-[15px]">{step.title}</strong>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.description}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
