import Image from "next/image";

export function SignInCoverBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <Image
        src="/sign-in-cover.png"
        alt=""
        fill
        priority
        unoptimized
        sizes="(min-width: 1024px) 55vw, 100vw"
        className="object-cover object-[center_28%] opacity-[0.23]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,47,103,0.55)_0%,rgba(11,47,103,0.72)_45%,rgba(11,47,103,0.88)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_15%,rgba(36,166,216,0.18),transparent_55%)]" />
    </div>
  );
}
