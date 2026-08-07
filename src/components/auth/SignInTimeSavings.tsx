"use client";

import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

const METRICS = [
  {
    period: "Each day",
    value: 45,
    unit: "minutes",
    detail: "Not spent re-deciding what to do first",
  },
  {
    period: "Each week",
    value: 4,
    unit: "hours",
    detail: "About one deep-work morning back",
  },
  {
    period: "Each month",
    value: 16,
    unit: "hours",
    detail: "Roughly two full workdays returned",
  },
] as const;

function CountUp({
  value,
  reduceMotion,
  delay = 0,
}: {
  value: number;
  reduceMotion: boolean | null;
  delay?: number;
}) {
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState(reduceMotion ? value : 0);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }

    motionValue.set(0);
    const controls = animate(motionValue, value, {
      duration: 0.85,
      delay,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });

    return () => controls.stop();
  }, [value, reduceMotion, delay, motionValue]);

  return <>{display}</>;
}

export function SignInTimeSavings() {
  const reduceMotion = useReducedMotion();

  return (
    <section aria-labelledby="time-savings-heading" className="w-full max-w-xl">
      <div className="mb-4">
        <p
          id="time-savings-heading"
          className="font-display text-[1.15rem] font-semibold tracking-tight text-white xl:text-[1.25rem]"
        >
          Time you get back
        </p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-white/70">
          Approximate time saved when you stop figuring out what to work on —
          and start from a clear next move.
        </p>
      </div>

      <ul className="grid grid-cols-3 gap-3 xl:gap-3.5">
        {METRICS.map((metric, index) => (
          <li key={metric.period}>
            <motion.article
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: reduceMotion ? 0 : 0.08 * index,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="flex h-full flex-col rounded-2xl border border-white/25 px-3.5 py-4 shadow-[0_14px_34px_-16px_rgba(0,0,0,0.45)] backdrop-blur-md xl:px-4 xl:py-5"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
            >
              <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-white/55">
                {metric.period}
              </p>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                <span className="font-display text-[1.9rem] font-semibold leading-none tracking-[-0.03em] text-white xl:text-[2.2rem]">
                  <CountUp
                    value={metric.value}
                    reduceMotion={reduceMotion}
                    delay={0.12 + index * 0.06}
                  />
                </span>
                <span className="text-[13px] font-medium text-white/65">
                  {metric.unit}
                </span>
              </p>
              <p className="mt-2.5 text-[12px] leading-snug text-white/70 xl:text-[13px]">
                {metric.detail}
              </p>
            </motion.article>
          </li>
        ))}
      </ul>
    </section>
  );
}
