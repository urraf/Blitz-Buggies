import { Btn } from "../../../shared/src/index.ts";

// Keyboard + gamepad → button bits. Bindings are fixed but listed in the How-to-Play panel.
const KEYMAP: Record<string, number> = {
  KeyW: Btn.Up, ArrowUp: Btn.Up,
  KeyS: Btn.Down, ArrowDown: Btn.Down,
  KeyA: Btn.Left, ArrowLeft: Btn.Left,
  KeyD: Btn.Right, ArrowRight: Btn.Right,
  ShiftLeft: Btn.Drift, ShiftRight: Btn.Drift, KeyK: Btn.Drift,
  Space: Btn.Fire, KeyJ: Btn.Fire, Enter: Btn.Fire,
};

class Input {
  private held = 0;
  enabled = false;
  /** Test/automation hook: OR'd into sampled bits. */
  forced = 0;
  /** Bits held by the on-screen touch controls. */
  touch = 0;

  constructor() {
    window.addEventListener("keydown", (e) => {
      const b = KEYMAP[e.code];
      if (b === undefined || !this.enabled) return;
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      this.held |= b;
      e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      const b = KEYMAP[e.code];
      if (b !== undefined) this.held &= ~b;
    });
    window.addEventListener("blur", () => { this.held = 0; });
  }

  sample(): number {
    if (!this.enabled) return 0;
    let bits = this.held | this.forced | this.touch;
    const pads = navigator.getGamepads?.() ?? [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] ?? 0;
      if (ax < -0.35) bits |= Btn.Left;
      if (ax > 0.35) bits |= Btn.Right;
      const b = (i: number) => gp.buttons[i]?.pressed;
      if (b(7) || b(0)) bits |= Btn.Up;
      if (b(6) || b(1)) bits |= Btn.Down;
      if (b(5) || b(2)) bits |= Btn.Fire;
      if (b(4)) bits |= Btn.Drift;
    }
    return bits;
  }

  clear() { this.held = 0; this.touch = 0; }
}

export const input = new Input();
