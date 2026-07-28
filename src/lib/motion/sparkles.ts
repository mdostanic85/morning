/**
 * Sparkle burst microinteraction from the reference prototype: small colored
 * particles fly out from a point (e.g. a completed checkbox or a clicked
 * primary button). Pure CSS animation — the particles remove themselves.
 */
const SPARKLE_COLORS = [
  "var(--accent)",
  "var(--orange)",
  "var(--mint)",
  "var(--sky)",
  "var(--sun)",
  "var(--violet)",
];

export function burstSparkles(x: number, y: number, count = 8): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement("span");
    particle.className = "sparkle";
    particle.style.left = `${x - 4}px`;
    particle.style.top = `${y - 4}px`;
    particle.style.background = SPARKLE_COLORS[index % SPARKLE_COLORS.length];

    const angle = (Math.PI * 2 * index) / count;
    const distance = 28 + Math.random() * 34;
    particle.style.setProperty("--sparkle-x", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--sparkle-y", `${Math.sin(angle) * distance}px`);

    document.body.appendChild(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  }
}

export function burstSparklesFromElement(element: Element, count = 10): void {
  const rect = element.getBoundingClientRect();
  burstSparkles(rect.left + rect.width / 2, rect.top + rect.height / 2, count);
}
