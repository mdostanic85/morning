"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface AppTooltipProps {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  delay?: number;
  isInteractive?: boolean;
}

interface TooltipPosition {
  left: number;
  top: number;
  arrowLeft: number;
  placement: "top" | "bottom";
  ready: boolean;
}

const INITIAL_POSITION: TooltipPosition = {
  left: 0,
  top: 0,
  arrowLeft: 0,
  placement: "top",
  ready: false,
};

/**
 * A tooltip may only say something the screen does not already say.
 *
 * Allowed: an unlabelled control or bare value (a switch, a raw score), a term
 * whose meaning is not derivable from its label (source systems, confidence),
 * or a fact rendered nowhere nearby (the title behind an evidence id).
 *
 * Not allowed: repeating visible text, restating a label in other words, or
 * naming a universally understood icon (close, send, menu) that already has an
 * `aria-label`. Truncated text is not a reason either — shorten or wrap it.
 */
export function AppTooltip({
  children,
  content,
  className,
  delay = 350,
  isInteractive = false,
}: AppTooltipProps) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>(INITIAL_POSITION);

  const clearTimer = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const show = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(true), delay);
  }, [clearTimer, delay]);

  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
    setPosition(INITIAL_POSITION);
  }, [clearTimer]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const gutter = 12;
    const gap = 10;
    const center = triggerRect.left + triggerRect.width / 2;
    const minLeft = gutter + tooltipRect.width / 2;
    const maxLeft = window.innerWidth - gutter - tooltipRect.width / 2;
    const left = Math.min(Math.max(center, minLeft), Math.max(minLeft, maxLeft));
    const fitsAbove = triggerRect.top - tooltipRect.height - gap >= gutter;
    const placement = fitsAbove ? "top" : "bottom";
    const top = fitsAbove
      ? triggerRect.top - tooltipRect.height - gap
      : triggerRect.bottom + gap;

    // The arrow follows the trigger even after the tooltip is clamped to the
    // viewport, but never slides past its own rounded corners.
    const arrowInset = 14;
    const arrowLeft = Math.min(
      Math.max(center - (left - tooltipRect.width / 2), arrowInset),
      Math.max(arrowInset, tooltipRect.width - arrowInset)
    );

    setPosition({ left, top, arrowLeft, placement, ready: true });
  }, []);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => clearTimer, [clearTimer]);

  return (
    <>
      <span
        ref={triggerRef}
        className="app-tooltip-trigger"
        tabIndex={isInteractive ? undefined : 0}
        aria-describedby={open ? id : undefined}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocusCapture={show}
        onBlurCapture={hide}
        onKeyDown={(event) => {
          if (event.key === "Escape") hide();
        }}
      >
        {children}
      </span>
      {open
        ? createPortal(
            <div
              ref={tooltipRef}
              id={id}
              role="tooltip"
              data-placement={position.placement}
              className={cn("app-tooltip-content", className)}
              style={
                {
                  left: position.left,
                  top: position.top,
                  visibility: position.ready ? "visible" : "hidden",
                  "--tooltip-arrow-left": `${position.arrowLeft}px`,
                  "--tooltip-enter-shift": position.placement === "top" ? "4px" : "-4px",
                } as CSSProperties
              }
            >
              {content}
              <span className="app-tooltip-arrow" aria-hidden />
            </div>,
            document.body
          )
        : null}
    </>
  );
}
