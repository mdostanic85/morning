"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react/button";
import { Modal } from "@heroui/react/modal";
import { ArrowRightIcon, CheckCircle2Icon, MousePointer2Icon, QuoteIcon } from "lucide-react";
import styles from "./WelcomeModal.module.css";

const WELCOME_SEEN_KEY = "worklight-welcome-seen";

export function WelcomeModal() {
 const router = useRouter();
 const [open, setOpen] = useState(false);

 useEffect(() => {
 const reveal = window.setTimeout(() => {
 if (window.sessionStorage.getItem(WELCOME_SEEN_KEY) !== "true") {
 setOpen(true);
 }
 }, 0);

 return () => window.clearTimeout(reveal);
 }, []);

 function handleOpenChange(nextOpen: boolean) {
 setOpen(nextOpen);
 if (!nextOpen) {
 window.sessionStorage.setItem(WELCOME_SEEN_KEY, "true");
 }
 }

 function openSettings() {
 handleOpenChange(false);
 router.push("/settings");
 }

 return (
 <Modal isOpen={open} onOpenChange={handleOpenChange}>
 <Modal.Backdrop variant="blur" className="bg-background/70">
 <Modal.Container placement="center" size="sm" className="w-full max-w-none px-4">
 <Modal.Dialog className="relative w-full max-w-2xl overflow-hidden rounded-surface border border-border bg-overlay p-0 text-sm text-foreground shadow-[var(--elevation-raised)] outline-none">
 <div className={styles["welcome-beam"]} aria-hidden />
 <div className="grid sm:grid-cols-[minmax(0,1fr)_16rem]">
 <div className="px-6 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-7">
 <div className="mb-8 flex items-center justify-between gap-4">
 <Image
 src="/worklight-logo.svg"
 alt="Worklight"
 width={96}
 height={34}
 priority
 unoptimized
 className="h-[34px] w-[96px] dark:brightness-110"
 />
 <span className="rounded-full border border-border bg-surface-soft px-3 py-1 text-[14px] font-medium text-muted">
 Read-only by default
 </span>
 </div>

 <Modal.Header className="flex flex-col gap-3 p-0">
 <p className="eyebrow text-accent">Your daily briefing</p>
 <Modal.Heading className="font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[2.35rem]">
 Start with one clear next move.
 </Modal.Heading>
 <div slot="description" className="text-[15px] leading-relaxed text-muted">
 Worklight turns signals from your tools into a calm, evidence-backed plan for today.
 </div>
 </Modal.Header>

 <div className="mt-8 flex flex-col gap-2 sm:flex-row">
 <Button className="w-full sm:w-auto" onClick={openSettings}>
 Set up sources
 <ArrowRightIcon className="size-4" aria-hidden />
 </Button>
 <Button
 variant="ghost"
 className="w-full sm:w-auto"
 onClick={() => handleOpenChange(false)}
 >
 Continue to Today
 </Button>
 </div>
 </div>

 <aside className="border-t border-border bg-surface-soft px-6 py-6 sm:border-l sm:border-t-0 sm:px-5 sm:py-7">
 <p className="text-[14px] font-semibold text-foreground">Every recommendation includes</p>
 <div className="mt-5 space-y-5">
 <div className={styles["briefing-step"]}>
 <span className={styles["step-icon"]}>
 <QuoteIcon className="size-4" aria-hidden />
 </span>
 <div>
 <p className="font-semibold text-foreground">Evidence</p>
 <p className="mt-0.5 leading-relaxed text-muted">The source that justifies it.</p>
 </div>
 </div>
 <div className={styles["briefing-step"]}>
 <span className={styles["step-icon"]}>
 <MousePointer2Icon className="size-4" aria-hidden />
 </span>
 <div>
 <p className="font-semibold text-foreground">Next action</p>
 <p className="mt-0.5 leading-relaxed text-muted">One concrete step to take.</p>
 </div>
 </div>
 <div className={styles["briefing-step"]}>
 <span className={styles["step-icon"]}>
 <CheckCircle2Icon className="size-4" aria-hidden />
 </span>
 <div>
 <p className="font-semibold text-foreground">Done criteria</p>
 <p className="mt-0.5 leading-relaxed text-muted">A checkable finish line.</p>
 </div>
 </div>
 </div>
 <p className="mt-6 border-t border-border pt-4 text-[14px] leading-relaxed text-muted">
 Unclear evidence stays flagged for your review.
 </p>
 </aside>
 </div>
 </Modal.Dialog>
 </Modal.Container>
 </Modal.Backdrop>
 </Modal>
 );
}
