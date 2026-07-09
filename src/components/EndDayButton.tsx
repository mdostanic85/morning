"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function EndDayButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function endDay() {
    setPending(true);
    const res = await fetch("/api/day/end", { method: "POST" });
    const data = (await res.json()) as { error?: string };
    setPending(false);
    if (!res.ok) {
      toast.error(data.error ?? "Could not end day.");
      return;
    }
    toast.success("Daily memory saved.");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={endDay}
      disabled={pending}
      className="hover:border-warm/40 hover:text-warm"
    >
      {pending ? "Ending day…" : "End day"}
    </Button>
  );
}
