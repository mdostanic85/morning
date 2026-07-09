/**
 * Programmatically built Lottie animation for the "Sync my day" overlay.
 *
 * Motion design (LottieFiles motion-design skill, "Premium" personality):
 * - Primary layer: accent arc chasing around the ring (rotation + animated trim)
 * - Secondary layer: counter-rotating dawn-gold inner arc
 * - Ambient layer: faint breathing track ring
 * The ring center stays empty — the progress percentage renders there in HTML.
 * Loop is seamless (2s, 60fps); linear easing only on the spinner rotation.
 */

type Rgb = [number, number, number];

const SINE_IN = { x: [0.42], y: [0] };
const SINE_OUT = { x: [0.58], y: [1] };
const LINEAR_IN = { x: [0.833], y: [0.833] };
const LINEAR_OUT = { x: [0.167], y: [0.167] };

function hexToRgb01(hex: string, fallback: Rgb): Rgb {
  const match = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return fallback;
  const value = parseInt(match[1], 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Reads the app's CSS palette so the animation matches light/dark themes. */
export function readSyncAnimationColors(): { accent: Rgb; warm: Rgb } {
  const fallbackAccent: Rgb = [0.522, 0.769, 0.933]; // #85c4ee
  const fallbackWarm: Rgb = [0.918, 0.706, 0.451]; // #eab473
  if (typeof window === "undefined") {
    return { accent: fallbackAccent, warm: fallbackWarm };
  }
  const styles = getComputedStyle(document.documentElement);
  return {
    accent: hexToRgb01(styles.getPropertyValue("--accent"), fallbackAccent),
    warm: hexToRgb01(styles.getPropertyValue("--warm"), fallbackWarm),
  };
}

function ellipse(size: number) {
  return { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [size, size] } };
}

function stroke(color: Rgb, width: number, opacity = 100) {
  return {
    ty: "st",
    c: { a: 0, k: [...color, 1] },
    o: { a: 0, k: opacity },
    w: { a: 0, k: width },
    lc: 2,
    lj: 2,
  };
}

function groupTransform() {
  return {
    ty: "tr",
    p: { a: 0, k: [0, 0] },
    a: { a: 0, k: [0, 0] },
    s: { a: 0, k: [100, 100] },
    r: { a: 0, k: 0 },
    o: { a: 0, k: 100 },
  };
}

function staticTransform(extra?: Record<string, unknown>) {
  return {
    o: { a: 0, k: 100 },
    r: { a: 0, k: 0 },
    p: { a: 0, k: [100, 100, 0] },
    a: { a: 0, k: [0, 0, 0] },
    s: { a: 0, k: [100, 100, 100] },
    ...extra,
  };
}

function spinTransform(from: number, to: number) {
  return staticTransform({
    r: {
      a: 1,
      k: [
        { i: LINEAR_IN, o: LINEAR_OUT, t: 0, s: [from] },
        { t: 120, s: [to] },
      ],
    },
  });
}

export function buildSyncAnimationData(colors: { accent: Rgb; warm: Rgb }) {
  const { accent, warm } = colors;

  const trackLayer = {
    ddd: 0,
    ind: 1,
    ty: 4,
    nm: "ambient-track",
    sr: 1,
    ks: staticTransform({
      o: {
        a: 1,
        k: [
          { i: SINE_OUT, o: SINE_IN, t: 0, s: [8] },
          { i: SINE_OUT, o: SINE_IN, t: 60, s: [16] },
          { t: 120, s: [8] },
        ],
      },
    }),
    ao: 0,
    shapes: [{ ty: "gr", it: [ellipse(150), stroke(accent, 7), groupTransform()], nm: "track" }],
    ip: 0,
    op: 120,
    st: 0,
  };

  const outerArcLayer = {
    ddd: 0,
    ind: 2,
    ty: 4,
    nm: "primary-arc",
    sr: 1,
    ks: spinTransform(0, 360),
    ao: 0,
    shapes: [
      {
        ty: "gr",
        it: [
          ellipse(150),
          {
            ty: "tm",
            s: { a: 0, k: 0 },
            e: {
              a: 1,
              k: [
                { i: SINE_OUT, o: SINE_IN, t: 0, s: [18] },
                { i: SINE_OUT, o: SINE_IN, t: 60, s: [68] },
                { t: 120, s: [18] },
              ],
            },
            o: { a: 0, k: 0 },
            m: 1,
          },
          stroke(accent, 7),
          groupTransform(),
        ],
        nm: "arc",
      },
    ],
    ip: 0,
    op: 120,
    st: 0,
  };

  const innerArcLayer = {
    ddd: 0,
    ind: 3,
    ty: 4,
    nm: "secondary-arc",
    sr: 1,
    ks: spinTransform(360, 0),
    ao: 0,
    shapes: [
      {
        ty: "gr",
        it: [
          ellipse(104),
          { ty: "tm", s: { a: 0, k: 8 }, e: { a: 0, k: 46 }, o: { a: 0, k: 0 }, m: 1 },
          stroke(warm, 5, 85),
          groupTransform(),
        ],
        nm: "arc",
      },
    ],
    ip: 0,
    op: 120,
    st: 0,
  };

  return {
    v: "5.9.6",
    fr: 60,
    ip: 0,
    op: 120,
    w: 200,
    h: 200,
    nm: "sync-my-day",
    ddd: 0,
    assets: [],
    layers: [innerArcLayer, outerArcLayer, trackLayer],
  };
}
