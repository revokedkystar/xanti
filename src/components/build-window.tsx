"use client";

import { useEffect, useRef } from "react";

export type Client = {
  label: string;
  color: string;
  /** Where the cursor rests when nothing moves (reduced motion), as a share of the window's size. */
  x: string;
  y: string;
};

export type BuildLine = { text: string; from: number; to: number };

/*
 * "The build": a pixel browser window that puts itself together, pinned while
 * it scrolls past.
 *
 * Scrolling through the tall outer box keeps the window locked in the middle
 * of the screen and plays this through:
 *
 *   0.00 – 0.22  scattered pixels fly in and lock into the window frame
 *   0.10 – 0.38  the page layout flies in, as a grey wireframe
 *   0.04 – 0.44  meanwhile the window grows to fill most of the screen
 *   0.30 – 0.50  the wireframe dissolves, pixel by pixel, into the design
 *   0.50 – 0.78  the first client cursor heads over and clicks the button
 *   0.56 – 0.96  the window shrinks back down
 *
 * Client cursors (one per country) wander over the window the whole time,
 * like people looking at a shared design file. Behind it is a dot grid, like
 * the canvas of a design tool.
 *
 * Everything is drawn in the site's three greys with 2px checkerboard
 * dithering between neighbouring greys. With reduced motion on, nothing is
 * pinned and the finished window is drawn once, with the cursors resting.
 */

// Darkest grey matches the section background (#050505).
const PALETTE = ["#050505", "#4a4a4a", "#d4d4d4"];
const DITHER = 2;
// The window is a grid of COLS × ROWS pixel cells (16:10).
const COLS = 40;
const ROWS = 25;
const TAU = Math.PI * 2;

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263 + 5 * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const smoothstep = (a: number, b: number, n: number) => {
  const t = clamp((n - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Like smoothstep, but flatter at both ends, so motion eases in and out more gently. */
const smootherstep = (a: number, b: number, n: number) => {
  const t = clamp((n - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/*
 * Cell colours are steps 0–4: even steps are the three greys, odd steps the
 * checkerboard between the two either side. Each cell has a wireframe colour
 * and a finished colour, a delay for when it flies in, a threshold for when
 * it turns to its finished colour, and a scattered starting point.
 */
type Cell = {
  i: number;
  j: number;
  wire: number;
  final: number;
  cta: boolean;
  delay: number;
  fill: number;
  sx: number;
  sy: number;
};

function layer(paint: (put: (c0: number, r0: number, c1: number, r1: number, wire: number, final: number, cta?: boolean) => void) => void, seed: number) {
  const grid = new Map<number, { wire: number; final: number; cta: boolean }>();
  paint((c0, r0, c1, r1, wire, final, cta = false) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid.set(r * COLS + c, { wire, final, cta });
  });
  return Array.from(grid, ([k, v]): Cell => {
    const i = k % COLS;
    const j = Math.floor(k / COLS);
    return {
      ...v,
      i,
      j,
      delay: hash(i + seed, j),
      fill: hash(i + 97, j + 13 + seed),
      sx: 0.5 + (hash(i + 31, j + 7 + seed) - 0.5) * 3.4,
      sy: 0.5 + (hash(i + 5 + seed, j + 61) - 0.5) * 3.4,
    };
  });
}

// The window itself: title bar, its three buttons, the address bar and the page.
const FRAME = layer((put) => {
  put(0, 0, COLS - 1, 2, 2, 2);
  put(1, 1, 1, 1, 4, 4);
  put(3, 1, 3, 1, 3, 3);
  put(5, 1, 5, 1, 1, 1);
  put(9, 1, 30, 1, 3, 3);
  put(0, 3, COLS - 1, ROWS - 1, 4, 4);
}, 0);

// The page on it: menu bar, headline, text, a button, a picture and a footer.
const CONTENT = layer((put) => {
  // Logo, menu links and a menu button.
  put(2, 5, 3, 6, 2, 0);
  put(21, 5, 23, 5, 3, 2);
  put(25, 5, 27, 5, 3, 2);
  put(29, 5, 31, 5, 3, 2);
  put(33, 4, 37, 6, 2, 0);
  put(34, 5, 36, 5, 3, 4);
  // Headline, two lines of text and the button.
  put(2, 9, 20, 10, 2, 0);
  put(2, 12, 14, 13, 2, 0);
  put(2, 15, 19, 15, 3, 2);
  put(2, 17, 16, 17, 3, 2);
  put(2, 19, 10, 21, 2, 0, true);
  put(4, 20, 8, 20, 3, 4, true);
  // A picture: sky, a sun and two hills.
  for (let r = 9; r <= 21; r++) {
    for (let c = 23; c <= 37; c++) {
      const u = (c - 23) / 14;
      const v = (r - 9) / 12;
      let idx = v < 0.3 ? 2 : 3;
      if (Math.hypot(c - 32.5, r - 12.5) < 2.9) idx = 4; // in cells, so it's round
      if (v > 0.62 + 0.08 * Math.sin(u * 5)) idx = 1;
      if (v > 0.8 + 0.06 * Math.sin(u * 3 + 1)) idx = 0;
      put(c, r, c, r, 3, idx);
    }
  }
  // Footer.
  put(0, 23, COLS - 1, ROWS - 1, 3, 2);
}, 211);

// Middle of the button, where the first cursor goes to click.
const CTA_U = 6.5 / COLS;
const CTA_V = 20.5 / ROWS;

/** Where client cursor k is over the window at scroll t, in window units. */
function cursorAt(k: number, t: number) {
  let u = 0.5 + 0.36 * Math.sin(t * TAU * 0.8 + k * 2.1);
  let v = 0.56 + 0.28 * Math.sin(t * TAU * 1.15 + k * 1.7 + 0.6);
  if (k === 0) {
    const go = smootherstep(0.5, 0.6, t) * (1 - smootherstep(0.7, 0.78, t));
    u += (CTA_U - u) * go;
    v += (CTA_V - v) * go;
  }
  return { u, v };
}

export function BuildWindow({ clients, lines = [] }: { clients: Client[]; lines?: BuildLine[] }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const cursorRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLCanvasElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const grid = gridRef.current;
    const cursors = cursorRefs.current;
    // Each caption's words, so they can rise in and out one after another.
    const lineEls = Array.from(linesRef.current?.querySelectorAll<HTMLElement>("[data-line]") ?? []);
    const lineWords = lineEls.map((el) => Array.from(el.querySelectorAll<HTMLElement>("[data-word]")));
    let layoutKey = "";

    /*
     * Place the captions beside the window at its full size, alternating left
     * and right, sized to the space there. When there's no room beside it
     * (a phone held upright), left-hand lines go above the window and
     * right-hand lines below it.
     */
    const layoutLines = (w: number, h: number, cx: number, cy: number, halfW: number, halfH: number) => {
      const key = `${w}|${h}|${Math.round(cx)}|${Math.round(cy)}|${Math.round(halfW)}`;
      if (key === layoutKey) return;
      layoutKey = key;
      const edge = Math.max(16, w * 0.03);
      const gap = Math.max(20, w * 0.02);
      const leftRoom = cx - halfW - gap - edge;
      const rightRoom = w - (cx + halfW) - gap - edge;
      const room = Math.min(leftRoom, rightRoom);
      lineEls.forEach((el, i) => {
        const left = i % 2 === 0;
        const st = el.style;
        st.left = st.right = st.top = st.bottom = "";
        if (room >= 170) {
          st.width = `${room}px`;
          st.fontSize = `${Math.round(Math.min(72, Math.max(28, room / 4.4)))}px`;
          st.top = "50%";
          st.translate = "0 -50%";
          st.textAlign = left ? "left" : "right";
          if (left) st.left = `${edge}px`;
          else st.right = `${edge}px`;
        } else {
          const top = 64; // below the menu bar
          const above = Math.max(0, cy - halfH - top);
          const below = Math.max(0, h - (cy + halfH));
          const size = Math.round(Math.min(48, Math.max(30, w / 10)));
          st.width = `${w - edge * 2}px`;
          st.left = `${edge}px`;
          st.fontSize = `${size}px`;
          st.textAlign = "center";
          st.translate = "0 -50%";
          // Centred in the space above or below the window, but always clear
          // of the menu bar and the bottom edge, even when that space is thin.
          const clear = size * 0.75 + 8;
          st.top = left ? `${Math.max(top + clear, top + above / 2)}px` : `${Math.min(h - clear, h - below / 2)}px`;
        }
      });
    };

    if (!outer || !box || !canvas || !grid) return;
    const ctx = canvas.getContext("2d");
    const gridCtx = grid.getContext("2d");
    if (!ctx || !gridCtx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let dpr = 1;
    let raf = 0;
    let visible = false;
    // Scroll progress as drawn: it glides after the real scroll position
    // instead of jumping with it, which smooths out uneven scroll steps.
    let shown = -1;
    let last = 0;
    const patterns = new Map<string, CanvasPattern>();

    // The 2px checkerboard between two greys.
    const checker = (a: string, b: string) => {
      const key = `${a}|${b}|${dpr}`;
      const hit = patterns.get(key);
      if (hit) return hit;
      const s = Math.max(1, Math.round(DITHER * dpr));
      const tile = document.createElement("canvas");
      tile.width = tile.height = s * 2;
      const tc = tile.getContext("2d")!;
      tc.fillStyle = a;
      tc.fillRect(0, 0, s * 2, s * 2);
      tc.fillStyle = b;
      tc.fillRect(s, 0, s, s);
      tc.fillRect(0, s, s, s);
      const p = ctx.createPattern(tile, "repeat")!;
      patterns.set(key, p);
      return p;
    };
    const paint = (idx: number) =>
      idx % 2 === 0 ? PALETTE[idx / 2] : checker(PALETTE[(idx - 1) / 2], PALETTE[(idx + 1) / 2]);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      grid.width = Math.round(grid.clientWidth * dpr);
      grid.height = Math.round(grid.clientHeight * dpr);
      patterns.clear();
    };

    // A design-tool canvas: a dot grid that slides up slowly with the scroll.
    const drawGrid = (t: number, morph: number) => {
      const w = grid.width;
      const h = grid.height;
      gridCtx.clearRect(0, 0, w, h);
      const gap = Math.round(28 * dpr);
      const off = (((-t * h * 0.35) % gap) + gap) % gap;
      const s = Math.max(1, Math.round(2 * dpr));
      gridCtx.globalAlpha = 0.4 + 0.3 * morph;
      gridCtx.fillStyle = PALETTE[1];
      for (let y = off; y < h; y += gap) {
        for (let x = gap / 2; x < w; x += gap) gridCtx.fillRect(Math.round(x), Math.round(y), s, s);
      }
      gridCtx.globalAlpha = 1;
    };

    /** Draws the window centred on (cx, cy), with cells `cell` device pixels wide. */
    const drawWindow = (cx: number, cy: number, cell: number, t: number, now: number) => {
      const winW = cell * COLS;
      const winH = cell * ROWS;
      const ox = Math.round(cx * dpr - winW / 2);
      const oy = Math.round(cy * dpr - winH / 2);
      const filled = smoothstep(0.3, 0.5, t);
      const flash = t > 0.62 && t < 0.7;

      const draw = (cells: Cell[], start: number, span: number) => {
        for (const c of cells) {
          let idx = c.fill < filled ? c.final : c.wire;
          if (flash && c.cta) idx = 4 - idx;
          const from = start + c.delay * span;
          const a = smootherstep(from, from + 0.1, t);
          ctx.fillStyle = paint(idx);
          if (a >= 1) {
            ctx.globalAlpha = 1;
            ctx.fillRect(ox + c.i * cell, oy + c.j * cell, cell, cell);
            continue;
          }
          // Still on its way: smaller, fainter and drifting a little.
          const wob = (1 - a) * 0.025;
          const u = c.sx + ((c.i + 0.5) / COLS - c.sx) * a + Math.sin(now * 0.0011 + c.delay * TAU) * wob;
          const v = c.sy + ((c.j + 0.5) / ROWS - c.sy) * a + Math.cos(now * 0.0009 + c.fill * TAU) * wob;
          const size = Math.max(1, Math.round(cell * (0.45 + 0.55 * a)));
          ctx.globalAlpha = 0.35 + 0.65 * a;
          ctx.fillRect(Math.round(ox + u * winW - size / 2), Math.round(oy + v * winH - size / 2), size, size);
        }
      };
      draw(FRAME, 0, 0.12);
      draw(CONTENT, 0.1, 0.18);
      ctx.globalAlpha = 1;
    };

    /** One full draw at scroll t. `live` moves the captions and cursors too. */
    const render = (t: number, morph: number, now: number, live: boolean) => {
      const c = canvas.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      // Grows to most of the screen, but never taller than it.
      const fullW = Math.max(b.width, Math.min(w >= 900 ? w * 0.56 : w * 0.92, h * 0.7 * (COLS / ROWS)));
      // Whole device pixels per cell, so the window stays crisp as it grows.
      const cell = Math.max(1, Math.round(((b.width + (fullW - b.width) * morph) * dpr) / COLS));
      const winW = (cell * COLS) / dpr;
      const winH = (cell * ROWS) / dpr;
      const cx = b.left + b.width / 2 - c.left;
      const cy = b.top + b.height / 2 - c.top;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawGrid(t, morph);

      if (live) {
        layoutLines(w, h, cx, cy, fullW / 2, fullW / (COLS / ROWS) / 2);

        // Captions: words rise in one after another, then lift away.
        lines.forEach((line, i) => {
          const words = lineWords[i];
          if (!words) return;
          words.forEach((word, j) => {
            const enter = smootherstep(line.from + j * 0.012, line.from + j * 0.012 + 0.06, t);
            const leave = smootherstep(line.to - 0.06 + j * 0.008, line.to + j * 0.008, t);
            const on = enter * (1 - leave);
            word.style.opacity = String(on);
            word.style.translate = `0 ${((1 - enter) * 0.7 - leave * 0.5).toFixed(3)}em`;
            word.style.filter = on > 0.99 ? "none" : `blur(${((1 - on) * 8).toFixed(1)}px)`;
          });
        });

        // Cursors wander over the window once it has started to form.
        const face = smoothstep(0.08, 0.16, t) * (1 - smoothstep(0.9, 0.97, t));
        clients.forEach((_, k) => {
          const el = cursors[k];
          if (!el) return;
          const at = cursorAt(k, t);
          // Kept on screen, label and all, on narrow screens.
          const x = b.width / 2 + (at.u - 0.5) * winW;
          const minX = c.left - b.left + 8;
          const maxX = c.left - b.left + w - el.offsetWidth - 8;
          el.style.left = `${Math.max(minX, Math.min(maxX, x))}px`;
          el.style.top = `${b.height / 2 + (at.v - 0.5) * winH}px`;
          el.style.setProperty("--face", String(face));
        });
      }

      drawWindow(cx, cy, cell, t, now);
    };

    if (reduced) {
      // The finished window, drawn once at its resting size.
      const still = () => {
        resize();
        render(0.5, 0, 0, false);
      };
      still();
      window.addEventListener("resize", still);
      return () => window.removeEventListener("resize", still);
    }

    const frame = (now: number) => {
      raf = visible ? requestAnimationFrame(frame) : 0;
      const vh = window.innerHeight;
      const rect = outer.getBoundingClientRect();
      const target = clamp(-rect.top / Math.max(1, rect.height - vh));
      const dt = Math.min(100, last ? now - last : 16);
      last = now;
      if (shown < 0) shown = target;
      shown += (target - shown) * (1 - Math.exp(-dt / 140));
      if (Math.abs(target - shown) < 0.0005) shown = target;
      const t = shown;
      // Long, overlapping grow and shrink phases with gentle ends.
      const morph = Math.min(smootherstep(0.04, 0.44, t), 1 - smootherstep(0.56, 0.96, t));
      render(t, morph, now, true);
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf) {
        // Start from where the page is, not from an old position.
        shown = -1;
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    });

    resize();
    io.observe(outer);
    window.addEventListener("resize", resize);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [clients, lines]);

  return (
    <div ref={outerRef} className="relative h-[300svh] motion-reduce:h-auto">
      <div className="sticky top-0 flex h-svh items-center justify-center overflow-hidden motion-reduce:static motion-reduce:h-auto">
        {/* Dot grid, behind the window. */}
        <canvas
          ref={gridRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
          style={{ imageRendering: "pixelated" }}
        />
        {/* The window's resting size; it is drawn on the canvas below. */}
        <div ref={boxRef} className="relative aspect-[8/5] w-[min(560px,86vw,100svh)]">
          {/* Above the window canvas, which comes later in the panel. */}
          <div aria-hidden className="absolute inset-0 z-10">
            {clients.map((p, i) => (
              <span
                key={p.label}
                ref={(el) => {
                  cursorRefs.current[i] = el;
                }}
                className="absolute -translate-x-[3px] -translate-y-[3px]"
                style={{ left: p.x, top: p.y, opacity: "var(--face, 1)" }}
              >
                <span data-scroll data-lag={0.2 + i * 0.15} className="fx-rise flex items-start">
                  <svg width="18" height="23" viewBox="0 0 14 18" shapeRendering="crispEdges">
                    <path
                      d="M2 2 L2 14 L5 11 L8 16 L10 15 L7 10 L11 10 Z"
                      fill={p.color}
                      stroke="#fff"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="mt-4 -ml-1 flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-sm whitespace-nowrap text-black shadow-sm">
                    <span className="size-3 rounded-sm" style={{ background: p.color }} />
                    {p.label}
                  </span>
                </span>
              </span>
            ))}
          </div>
        </div>
        {/* Screen readers get the client list and captions once, as plain text. */}
        <p className="sr-only">
          Clients in {clients.map((p) => p.label).join(", ")}.{" "}
          {lines.length > 0 && `${lines.map((l) => l.text).join(". ")}.`}
        </p>
        {lines.length > 0 && (
          <div ref={linesRef} aria-hidden className="pointer-events-none absolute inset-0 z-20 motion-reduce:hidden">
            {lines.map((l) => (
              <p
                key={l.text}
                data-line
                className="absolute font-serif text-[44px] leading-[0.95] tracking-[-0.01em] text-white italic [text-shadow:0_2px_28px_#050505,0_0_10px_#050505]"
              >
                {l.text.split(" ").map((w, j, all) => (
                  <span key={j} data-word className="inline-block opacity-0">
                    {w}
                    {j < all.length - 1 ? " " : ""}
                  </span>
                ))}
              </p>
            ))}
          </div>
        )}
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
    </div>
  );
}
