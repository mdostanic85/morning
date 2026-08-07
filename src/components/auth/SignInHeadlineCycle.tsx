"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

const SLIDES = [
  {
    headline: "Your next move, already clear.",
    body: "One calm briefing with the evidence, the next action, and a clear finish line.",
  },
  {
    headline: "One priority. Real evidence.",
    body: "Stop guessing what matters — every focus item traces back to a source.",
  },
  {
    headline: "Less deciding. More doing.",
    body: "Spend the day shipping, not re-planning what you already knew.",
  },
] as const;

const INTERVAL_MS = 4200;

export function SignInHeadlineCycle() {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const slide = SLIDES[index]!;

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (reduceMotion || !ready) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % SLIDES.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reduceMotion, ready]);

  return (
    <div className="max-w-xl">
      <div className="relative min-h-[8.25rem] xl:min-h-[9rem]">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.headline}
            initial={ready && !reduceMotion ? { opacity: 0, y: 18 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -14 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="text-pretty font-display text-[2.35rem] font-semibold leading-[1.05] tracking-[-0.04em] text-white xl:text-[2.9rem] xl:whitespace-nowrap">
              {slide.headline}
            </h1>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/65 xl:mt-4 xl:text-[16px]">
              {slide.body}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-5 flex items-center gap-2" aria-hidden>
        {SLIDES.map((item, i) => (
          <span
            key={item.headline}
            className={
              i === index
                ? "h-1.5 w-6 rounded-full bg-white/80 transition-[width] duration-300"
                : "h-1.5 w-1.5 rounded-full bg-white/30 transition-[width] duration-300"
            }
          />
        ))}
      </div>
    </div>
  );
}
