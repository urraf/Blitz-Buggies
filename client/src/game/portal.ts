import { sfx } from "../audio/sfx.ts";
import { input } from "./input.ts";

// Game-portal SDK adapter. A build made with VITE_PORTAL=poki loads the Poki SDK and reports loading,
// gameplay start/stop and ad breaks. Every other build gets no-ops, so game code calls these freely.

interface PokiSDKApi {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(onStart?: () => void): Promise<void>;
  openExternalLink?(url: string): void;
}

const PORTAL: string = import.meta.env.VITE_PORTAL ?? "";
let sdk: PokiSDKApi | null = null;
let playing = false;
let inBreak = false;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

// The game never waits for this: if the SDK is slow or blocked (ad blockers), play simply goes on without ads.
const ready: Promise<void> = PORTAL === "poki"
  ? loadScript("https://game-cdn.poki.com/scripts/v2/poki-sdk.js")
    .then(() => {
      const p = (window as unknown as { PokiSDK?: PokiSDKApi }).PokiSDK;
      return p?.init().then(() => { sdk = p; });
    })
    .catch(() => { sdk = null; })
  : Promise.resolve();

/** Is `el` (or a parent) able to scroll further in the wheel's direction? */
function canScroll(el: Element | null, dy: number): boolean {
  for (; el && el !== document.body; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) {
      if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
    }
  }
  return false;
}

if (PORTAL) {
  // inside a portal iframe, arrows / space / wheel must never scroll the portal page around the game
  const SCROLL_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown"]);
  const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON"]);
  addEventListener("keydown", (e) => {
    if (SCROLL_KEYS.has(e.code) && !TYPING.has((e.target as HTMLElement)?.tagName)) e.preventDefault();
  });
  addEventListener("wheel", (e) => { if (!canScroll(e.target as Element, e.deltaY)) e.preventDefault(); }, { passive: false });
}

export const portal = {
  name: PORTAL,

  loadingFinished() { void ready.then(() => sdk?.gameLoadingFinished()); },

  /** The player is actively playing (fired on their first input of a match or after unpausing). */
  gameplayStart() {
    if (playing || inBreak) return;
    playing = true;
    sdk?.gameplayStart();
  },

  /** Play was interrupted: pause, results, back to menu. */
  gameplayStop() {
    if (!playing) return;
    playing = false;
    sdk?.gameplayStop();
  },

  /**
   * Ad opportunity right before the player goes (back) into a match. The portal decides whether an ad
   * actually shows; while one does, all game audio and input are off and `onPause(true)` is called.
   */
  async commercialBreak(onPause?: (paused: boolean) => void) {
    if (!sdk || inBreak) return;
    portal.gameplayStop();
    inBreak = true;
    const inputWas = input.enabled;
    let paused = false;
    try {
      const ad = sdk.commercialBreak(() => {
        paused = true;
        sfx.adMute(true);
        input.enabled = false;
        onPause?.(true);
      });
      // safety net: never leave the player stuck if the ad call doesn't resolve (ads run 30 s at most)
      await Promise.race([ad, new Promise((r) => setTimeout(r, 60_000))]);
    } catch { /* no ad: carry on */ } finally {
      inBreak = false;
      if (paused) {
        sfx.adMute(false);
        input.enabled = inputWas;
        onPause?.(false);
      }
    }
  },

  /** Open a page outside the game (portals require their own API for this). */
  openLink(url: string) {
    if (sdk?.openExternalLink) sdk.openExternalLink(url);
    else window.open(url, "_blank", "noopener");
  },
};
