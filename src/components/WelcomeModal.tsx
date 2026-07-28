"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@heroui/react/button";
import { Modal } from "@heroui/react/modal";
import styles from "./WelcomeModal.module.css";

const WELCOME_SEEN_KEY = "worklight-welcome-seen";

export function WelcomeModal() {
 const pathname = usePathname();
 const [open, setOpen] = useState(false);

 useEffect(() => {
 if (pathname === "/" || pathname.startsWith("/tasks") || pathname === "/how-ai-works") return;
 const reveal = window.setTimeout(() => {
 if (window.sessionStorage.getItem(WELCOME_SEEN_KEY) !== "true") {
 setOpen(true);
 }
 }, 0);

 return () => window.clearTimeout(reveal);
 }, [pathname]);

 function handleOpenChange(nextOpen: boolean) {
 setOpen(nextOpen);
 if (!nextOpen) {
 window.sessionStorage.setItem(WELCOME_SEEN_KEY, "true");
 }
 }

 return (
 <Modal isOpen={open} onOpenChange={handleOpenChange}>
 <Modal.Backdrop variant="blur" className="bg-background/75">
 <Modal.Container placement="center" size="sm" className="w-full max-w-none px-4">
 <Modal.Dialog className="relative w-full max-w-lg overflow-hidden rounded-surface border border-border bg-overlay p-0 text-sm text-foreground outline-none">
 <div className={styles["welcome-beam"]} aria-hidden />
 <div className="px-6 pb-7 pt-6 sm:px-8 sm:pb-8 sm:pt-7">
 <div className="mb-7 flex items-center gap-3">
 <span className="brand-mark" aria-hidden>
 W
 </span>
 <span className="font-display text-[15px] font-semibold tracking-tight">
 Worklight
 </span>
 </div>

 <Modal.Header className="flex flex-col gap-4 p-0">
 <Modal.Heading className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-[2rem]">
 Welcome to Worklight
 </Modal.Heading>
 <div slot="description" className="space-y-3 text-[15px] leading-relaxed text-muted">
 <p>
 Worklight brings tasks, meetings, and updates into one daily plan. It shows
 what to do first, why it matters, and what counts as done.
 </p>
 <p>
 Every recommendation links back to a source. If the evidence is unclear,
 Worklight asks you to review it.
 </p>
 </div>
 </Modal.Header>

 <Button className="mt-7 w-full sm:w-auto" onClick={() => handleOpenChange(false)}>
 Start
 </Button>
 </div>
 </Modal.Dialog>
 </Modal.Container>
 </Modal.Backdrop>
 </Modal>
 );
}
