"use client";

import { useEffect } from "react";

export function KnowledgeHashScroll() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#knowledge-")) return;

    const id = hash.slice("#knowledge-".length);
    const element = document.getElementById(`knowledge-${id}`);
    if (!element) return;

    requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("ring-2", "ring-accent/40");
      window.setTimeout(() => {
        element.classList.remove("ring-2", "ring-accent/40");
      }, 2000);
    });
  }, []);

  return null;
}
