/**
 * Tile-rain "scan line / 横流れ" connecting visual.
 *
 * Reverse-engineered from the reference video (see tmp/anim-ref/SPEC.md). A full
 * grid of rounded-square tiles (3 rows) over which a brightness crest sweeps
 * left->right and wraps, while the hue gradient (magenta -> green) scrolls
 * horizontally so every tile cycles through the cool spectrum across one loop.
 *
 * Rendered on a single 2D <canvas> rather than DOM nodes: one redraw of ~60
 * rounded rects with shadowBlur is far cheaper than animating 60 elements'
 * transforms/box-shadows, stays crisp on HiDPI, and is trivially
 * reduced-motion-able. Drops into the fixed band between the two avatars.
 */

const ROWS = 3;
const TARGET_COLS = 20;

const T = 1400; // loop period (ms) — MEDIUM confidence, tuned to taste
const ROW_DELAY = 0.018 * T; // ~25ms: "a little" vertical delay
const PULSE_K = 2; // brightness bump sharpness
const BASE = 0.12; // dim brightness floor (tiles never go fully black)
const HUE_DRIFT = 1; // hue gradient spans drifted per loop
const JITTER_PHASE = 0.05; // per-tile phase jitter (fraction of a cycle)

// Cool spectrum, left->right: magenta -> violet -> indigo -> blue -> teal -> green.
const HUE_START = 325;
const HUE_END = 150;
const SAT = 0.62;
const LIGHT_PEAK = 0.6;
const LIGHT_DIM = 0.1;

const TWO_PI = Math.PI * 2;
const frac = (x) => x - Math.floor(x);

function supportsRoundRect(ctx) {
  return typeof ctx.roundRect === "function";
}

function traceRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export class TileWave {
  #frame = (now) => {
    if (!this.running || !this.ctx) {
      this.frameId = 0;
      return;
    }
    if (typeof document !== "undefined" && document.hidden) {
      // Pause the loop while backgrounded; visibilitychange resumes it.
      this.frameId = 0;
      return;
    }
    if (this.resizeDirty) this.resize();
    this.#draw(now - this.startedAt);
    this.#schedule();
  };

  #onVisibility = () => {
    if (typeof document === "undefined") return;
    if (document.hidden) {
      if (this.frameId) cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    } else if (this.running && !this.frameId) {
      // Resume; the phase stays continuous because it is derived from startedAt.
      this.#schedule();
    }
  };

  constructor(canvasOrMount) {
    this.canvas = this.#resolveCanvas(canvasOrMount);
    this.ctx = this.canvas?.getContext?.("2d", { alpha: true }) || null;
    // "canvas2d" keeps the renderer contract the island/CSS/e2e rely on; this is
    // a 2D canvas renderer. "tile" marks it as the tile-matrix variant.
    if (this.canvas) {
      this.canvas.dataset.waveRenderer = this.ctx ? "canvas2d" : "none";
      if (this.ctx) this.canvas.dataset.waveStyle = "tile";
    }

    this.direction = 1; // 1 = left->right, -1 = right->left (receive)
    this.running = false; // desired state (stays true while tab is hidden)
    this.frameId = 0;
    this.startedAt = 0;
    this.resizeDirty = true;
    this.resizeObserver = null;

    // Geometry recomputed on resize.
    this.cssWidth = 0;
    this.cssHeight = 0;
    this.cols = TARGET_COLS;
    this.pitchX = 0;
    this.pitchY = 0;
    this.tile = 0;
    this.radius = 0;
    this.originX = 0;
    this.originY = 0;
    this.jitter = new Float32Array(ROWS * TARGET_COLS);

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.#onVisibility);
    }
    if (this.canvas && typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        this.resizeDirty = true;
      });
      this.resizeObserver.observe(this.canvas);
    }

    this.resize();
  }

  #resolveCanvas(canvasOrMount) {
    if (!canvasOrMount) return null;
    if (typeof HTMLCanvasElement !== "undefined" && canvasOrMount instanceof HTMLCanvasElement) {
      return canvasOrMount;
    }
    if (canvasOrMount.tagName === "CANVAS") return canvasOrMount;
    // A mount node was supplied: create a canvas that fills it.
    const doc = canvasOrMount.ownerDocument || (typeof document !== "undefined" ? document : null);
    if (!doc) return null;
    const canvas = doc.createElement("canvas");
    canvas.className = "webdrop-island__wave";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvasOrMount.appendChild(canvas);
    return canvas;
  }

  #reducedMotion() {
    return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  }

  setDirection(direction) {
    this.direction = direction < 0 ? -1 : 1;
  }

  setRunning(running) {
    if (running) this.start();
    else this.stop();
  }

  start() {
    if (!this.ctx) return;
    if (this.#reducedMotion()) {
      // No sweep under reduced motion — paint the static gradient grid once.
      this.resize();
      this.#drawStatic();
      return;
    }
    if (this.running) return;
    this.running = true;
    this.startedAt = performance.now();
    this.resizeDirty = true;
    this.#schedule();
  }

  stop() {
    this.running = false;
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  renderOnce(timeSeconds = 0) {
    if (!this.ctx) return;
    this.resize();
    if (this.#reducedMotion()) {
      this.#drawStatic();
      return;
    }
    this.#draw(timeSeconds * 1000);
  }

  destroy() {
    this.stop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.#onVisibility);
    }
    this.ctx = null;
  }

  resize() {
    if (!this.canvas || !this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || this.canvas.clientWidth || this.canvas.width || 1));
    const height = Math.max(1, Math.round(rect.height || this.canvas.clientHeight || this.canvas.height || 1));
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const backingW = Math.max(1, Math.round(width * dpr));
    const backingH = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== backingW || this.canvas.height !== backingH) {
      this.canvas.width = backingW;
      this.canvas.height = backingH;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cssWidth = width;
    this.cssHeight = height;
    this.#computeGrid(width, height);
    this.resizeDirty = false;
  }

  #computeGrid(width, height) {
    // Keep tiles square and the reference's ~0.70 tile/pitch ratio. Derive the
    // column count from width (capped at the reference's 20) so the band stays a
    // thin 3-row strip (~8:1) regardless of how wide the island band is.
    const cols = Math.max(8, Math.min(TARGET_COLS, Math.round(width / 9)));
    const pitchX = width / cols;
    const tile = pitchX * 0.7;
    const pitchY = tile / 0.81;
    const gridW = (cols - 1) * pitchX + tile;
    const gridH = (ROWS - 1) * pitchY + tile;

    this.pitchX = pitchX;
    this.pitchY = pitchY;
    this.tile = tile;
    this.radius = tile * 0.27;
    this.originX = (width - gridW) / 2;
    this.originY = (height - gridH) / 2;

    if (cols !== this.cols || this.jitter.length !== ROWS * cols) {
      this.cols = cols;
      this.jitter = new Float32Array(ROWS * cols);
      for (let i = 0; i < this.jitter.length; i += 1) {
        this.jitter[i] = Math.random() - 0.5; // -0.5..0.5
      }
    }
  }

  #schedule() {
    this.frameId = requestAnimationFrame(this.#frame);
  }

  #brightness(phase) {
    const c = 0.5 + 0.5 * Math.cos(TWO_PI * phase);
    return BASE + (1 - BASE) * Math.pow(c, PULSE_K);
  }

  #hue(u) {
    return HUE_START + (HUE_END - HUE_START) * frac(u);
  }

  #draw(elapsedMs) {
    const ctx = this.ctx;
    if (!ctx) return;
    const { cssWidth: w, cssHeight: h, cols, pitchX, pitchY, tile, radius, originX, originY } = this;
    const useRoundRect = supportsRoundRect(ctx);
    const t = elapsedMs / T;

    ctx.clearRect(0, 0, w, h);
    for (let r = 0; r < ROWS; r += 1) {
      const rowOffset = (ROW_DELAY / T) * r;
      for (let c = 0; c < cols; c += 1) {
        // Mirror the sweep for receive transfers (direction = -1).
        const sweepCol = this.direction >= 0 ? c : cols - 1 - c;
        const j = this.jitter[r * cols + c];
        const phase = t - sweepCol / cols - rowOffset + JITTER_PHASE * j;
        const b = this.#brightness(phase);

        const u = sweepCol / cols - t * HUE_DRIFT;
        const hue = this.#hue(u);
        const light = (LIGHT_DIM + (LIGHT_PEAK - LIGHT_DIM) * b) * 100;
        const fill = `hsl(${hue} ${SAT * 100}% ${light}%)`;

        ctx.fillStyle = fill;
        // Glow scales with brightness^2 so only the crest blooms (subtle, not neon).
        if (b > 0.35) {
          ctx.shadowColor = fill;
          ctx.shadowBlur = b * b * tile * 0.8;
        } else {
          ctx.shadowBlur = 0;
        }

        const x = originX + c * pitchX;
        const y = originY + r * pitchY;
        if (useRoundRect) {
          ctx.beginPath();
          ctx.roundRect(x, y, tile, tile, radius);
        } else {
          traceRoundRect(ctx, x, y, tile, tile, radius);
        }
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
  }

  #drawStatic() {
    const ctx = this.ctx;
    if (!ctx) return;
    const { cssWidth: w, cssHeight: h, cols, pitchX, pitchY, tile, radius, originX, originY } = this;
    const useRoundRect = supportsRoundRect(ctx);
    const b = 0.55; // constant mid brightness, no pulse/jitter/glow

    ctx.clearRect(0, 0, w, h);
    ctx.shadowBlur = 0;
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const hue = this.#hue(c / cols);
        const light = (LIGHT_DIM + (LIGHT_PEAK - LIGHT_DIM) * b) * 100;
        ctx.fillStyle = `hsl(${hue} ${SAT * 100}% ${light}%)`;
        const x = originX + c * pitchX;
        const y = originY + r * pitchY;
        if (useRoundRect) {
          ctx.beginPath();
          ctx.roundRect(x, y, tile, tile, radius);
        } else {
          traceRoundRect(ctx, x, y, tile, tile, radius);
        }
        ctx.fill();
      }
    }
  }
}
