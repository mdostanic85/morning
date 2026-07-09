"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

interface OwnerFilterDropdownProps {
  owners: string[];
  myName: string | null;
}

export function OwnerFilterDropdown({ owners, myName }: OwnerFilterDropdownProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  const ownersParam = searchParams.get("owners");

  // null = everyone, Set = specific people
  const selected: Set<string> | null =
    ownersParam === "all" ? null
    : ownersParam ? new Set(ownersParam.split(",").map((s) => s.toLowerCase()))
    : myName ? new Set([myName.toLowerCase()])
    : null;

  const isAll = selected === null;

  function navigate(next: Set<string> | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("owners", next === null ? "all" : Array.from(next).join(","));
    router.replace(`/?${params.toString()}`, { scroll: false });
    setOpen(false);
  }

  function toggle(owner: string) {
    const key = owner.toLowerCase();
    if (isAll) { navigate(new Set([key])); return; }
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
      navigate(next.size === 0 ? null : next);
    } else {
      next.add(key);
      navigate(next);
    }
  }

  let label: string;
  if (isAll) {
    label = "Everyone";
  } else if (selected.size === 1) {
    const key = Array.from(selected)[0];
    label = myName && key === myName.toLowerCase()
      ? "My tasks"
      : (owners.find((o) => o.toLowerCase() === key) ?? key);
  } else {
    label = `${selected.size} people`;
  }

  if (owners.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-3 py-[7px] text-[13px] font-medium text-muted transition-colors hover:bg-surface-soft hover:text-foreground"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1.5 min-w-[200px] rounded-surface border border-border bg-surface p-1.5 shadow-[var(--shadow)]">
          <button
            type="button"
            onClick={() => navigate(null)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${isAll ? "font-medium text-foreground" : "text-muted hover:bg-surface-soft hover:text-foreground"}`}
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isAll ? "border-accent bg-accent/20" : "border-border"}`}
            >
              {isAll ? <span className="h-2 w-2 rounded-sm bg-accent" /> : null}
            </span>
            Everyone
          </button>

          {owners.length > 0 ? <div className="my-1 border-t border-border/50" /> : null}

          {owners.map((owner) => {
            const key = owner.toLowerCase();
            const checked = !isAll && selected.has(key);
            const isMe = myName && key === myName.toLowerCase();
            return (
              <button
                key={owner}
                type="button"
                onClick={() => toggle(owner)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${checked ? "font-medium text-foreground" : "text-muted hover:bg-surface-soft hover:text-foreground"}`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-accent bg-accent/20" : "border-border"}`}
                >
                  {checked ? <span className="h-2 w-2 rounded-sm bg-accent" /> : null}
                </span>
                {owner}
                {isMe ? <span className="ml-auto text-[11px] text-muted-soft">me</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
