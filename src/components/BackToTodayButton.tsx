"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@heroui/react/button";

export function BackToTodayButton({
  label = "Back to today",
}: {
  label?: string;
}) {
  const router = useRouter();

  return (
    <Button type="button" variant="secondary" onPress={() => router.push("/")}>
      <ArrowLeft data-slot="icon" aria-hidden="true" className="size-4" />
      {label}
    </Button>
  );
}
