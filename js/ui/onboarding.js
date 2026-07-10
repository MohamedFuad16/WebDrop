import { Emitter } from "../utils/emitter.js?v=1.0.116";

// "How to use WebDrop" guided tour: a swipeable card carousel in the app's
// sheet design language. NEVER auto-shown — it opens only from the how-to FAB
// (bottom-left), so the feature ships disabled by default. The final slide
// deliberately reuses the app's swipe-control gesture (with a synthesized
// start chime) instead of a plain button: finishing the guide rehearses the
// same muscle memory the send flow uses.
export class OnboardingTour extends Emitter {
  constructor(document, { translate, bindSwipe } = {}) {
    super();
    this.document = document;
    this.translate = translate || ((key) => key);
    this.root = document.querySelector("[data-onboarding]");
    this.nodes = {
      card: this.root?.querySelector("[data-onboarding-card]"),
      track: this.root?.querySelector("[data-onboarding-track]"),
      dots: this.root?.querySelector("[data-onboarding-dots]"),
      close: this.root?.querySelector("[data-onboarding-close]"),
      backdrop: this.root?.querySelector("[data-onboarding-backdrop]"),
      swipeControl: this.root?.querySelector("[data-onboarding-swipe]"),
      swipeThumb: this.root?.querySelector("[data-onboarding-swipe-thumb]"),
      swipeText: this.root?.querySelector("[data-onboarding-swipe-text]")
    };
    this.previousFocus = null;
    this.audioContext = null;
    this.dotSyncFrame = 0;
    this.dotSyncTimer = 0;
    this.finishTimer = 0;
    if (!this.root || !this.nodes.track) return;
    this.slideCount = this.nodes.track.children.length;
    this.renderDots(0);
    this.nodes.close?.addEventListener("click", () => this.close());
    this.nodes.backdrop?.addEventListener("click", () => this.close());
    this.document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.root.hidden) this.close();
    });
    this.nodes.track.addEventListener("scroll", () => this.scheduleDotSync(), { passive: true });
    if (this.nodes.swipeControl && typeof bindSwipe === "function") {
      // Same binder as "Swipe up to send" — identical drag physics, keyboard
      // path, and completion threshold. Completion emits "onboarding-start" on
      // the AppView, which calls finish().
      this.resetStartSwipe = bindSwipe({
        control: this.nodes.swipeControl,
        thumb: this.nodes.swipeThumb,
        text: this.nodes.swipeText,
        axis: "x",
        defaultText: "onboardingSwipeStart",
        completeText: "onboardingStarted",
        eventName: "onboarding-start"
      });
    }
  }

  open() {
    if (!this.root) return;
    globalThis.clearTimeout(this.finishTimer);
    this.previousFocus = this.document.activeElement;
    this.root.hidden = false;
    this.root.dataset.open = "true";
    this.resetStartSwipe?.();
    this.nodes.track.scrollTo({ left: 0, behavior: "instant" });
    this.renderDots(0);
    // Scroll events can be throttled or swallowed entirely (embedded webviews,
    // backgrounded tabs), so a low-rate poll keeps the dots honest while open;
    // the scroll listener still gives instant response where events do fire.
    globalThis.clearInterval(this.dotSyncTimer);
    this.dotSyncTimer = globalThis.setInterval(() => this.syncDots(), 200);
    this.nodes.close?.focus({ preventScroll: true });
  }

  close() {
    if (!this.root || this.root.hidden) return;
    globalThis.clearTimeout(this.finishTimer);
    globalThis.clearInterval(this.dotSyncTimer);
    this.dotSyncTimer = 0;
    delete this.root.dataset.open;
    this.root.hidden = true;
    if (this.previousFocus?.focus && this.document.contains(this.previousFocus)) {
      this.previousFocus.focus({ preventScroll: true });
    }
    this.previousFocus = null;
  }

  // Called when the final slide's swipe completes: reward the gesture (chime +
  // haptic), let the filled track read for a beat, then dismiss.
  finish() {
    this.playStartChime();
    try {
      navigator.vibrate?.([14, 60, 22]);
    } catch {
      // Haptics are a garnish.
    }
    globalThis.clearTimeout(this.finishTimer);
    this.finishTimer = globalThis.setTimeout(() => this.close(), 650);
  }

  // rAF only COALESCES bursty scroll events; the open() poll calls syncDots()
  // directly — rAF can be suspended outright (hidden/embedded pages), and a
  // dropped frame here must not deadlock the pending-frame guard.
  scheduleDotSync() {
    if (this.dotSyncFrame) return;
    this.dotSyncFrame = globalThis.requestAnimationFrame(() => {
      this.dotSyncFrame = 0;
      this.syncDots();
    });
  }

  syncDots() {
    const track = this.nodes.track;
    const width = track.clientWidth || 1;
    this.renderDots(Math.max(0, Math.min(this.slideCount - 1, Math.round(track.scrollLeft / width))));
  }

  renderDots(activeIndex) {
    const dots = this.nodes.dots;
    if (!dots) return;
    if (dots.children.length !== this.slideCount) {
      dots.replaceChildren(...Array.from({ length: this.slideCount }, (_, index) => {
        const dot = this.document.createElement("button");
        dot.type = "button";
        dot.className = "onboarding__dot";
        dot.setAttribute("aria-label", this.translate("onboardingGoToSlide", { number: index + 1 }));
        dot.addEventListener("click", () => {
          this.nodes.track.scrollTo({ left: index * this.nodes.track.clientWidth, behavior: "smooth" });
        });
        return dot;
      }));
    }
    [...dots.children].forEach((dot, index) => {
      dot.dataset.active = String(index === activeIndex);
    });
  }

  // A soft two-note rise (E5 -> B5) synthesized on the spot — no audio asset,
  // and it runs inside the swipe's user gesture so autoplay policies allow it.
  playStartChime() {
    try {
      const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctx) return;
      this.audioContext ||= new Ctx();
      const ctx = this.audioContext;
      if (ctx.state === "suspended") ctx.resume?.();
      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.value = 0.14;
      master.connect(ctx.destination);
      for (const [frequency, at, length] of [[659.25, 0, 0.34], [987.77, 0.09, 0.46]]) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = frequency;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now + at);
        gain.gain.linearRampToValueAtTime(1, now + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + at + length);
        osc.connect(gain);
        gain.connect(master);
        osc.start(now + at);
        osc.stop(now + at + length + 0.05);
      }
    } catch {
      // Sound is a garnish — never let it break the flow.
    }
  }
}
