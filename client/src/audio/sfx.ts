// Sound: CC0 sample effects (Kenney, see public/sfx/CREDITS.txt) + a synthesized engine and an
// original procedurally sequenced music loop. Everything is lazy: nothing loads before the first click.

type SampleName =
  | "gun0" | "gun1" | "gun2" | "rocket" | "hornet" | "whoosh" | "lob" | "mine"
  | "boom0" | "boom1" | "boom2" | "boombig" | "hurt" | "hitmark" | "blocked" | "shield"
  | "pickup" | "powerup" | "boost" | "turbo" | "hop" | "land" | "bump" | "beep" | "go" | "spawn"
  | "kill" | "streak" | "wrecked" | "victory" | "defeat" | "levelup" | "coins"
  | "click" | "back" | "open" | "confirm";

const SAMPLES: SampleName[] = [
  "gun0", "gun1", "gun2", "rocket", "hornet", "whoosh", "lob", "mine", "boom0", "boom1", "boom2", "boombig", "hurt", "hitmark",
  "blocked", "shield", "pickup", "powerup", "boost", "turbo", "hop", "land", "bump", "beep", "go", "spawn", "kill", "streak",
  "wrecked", "victory", "defeat", "levelup", "coins", "click", "back", "open", "confirm",
];

class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private fx!: GainNode;
  private musicBus!: GainNode;
  private engineGain!: GainNode;
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter!: BiquadFilterNode;
  private buffers = new Map<SampleName, AudioBuffer>();
  private loading = false;
  private lastPlay = new Map<SampleName, number>();
  private musicTimer: number | null = null;
  private musicTrack: "menu" | "race" | null = null;
  private wantTrack: "menu" | "race" | null = null;
  private step = 0;
  private nextNote = 0;
  volume = 0.7;
  fxVolume = 0.9;
  engineVolume = 0.5;
  musicVolume = 0.45;

  /** Must be called from a user gesture (browsers block autoplay). */
  unlock() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
      } catch { return; }
      const c = this.ctx;
      this.master = c.createGain();
      // gentle bus compression keeps explosions from clipping when several overlap
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      this.master.connect(comp).connect(c.destination);
      this.fx = c.createGain();
      this.fx.connect(this.master);
      this.musicBus = c.createGain();
      this.musicBus.connect(this.master);
      this.engineGain = c.createGain();
      this.engineGain.gain.value = 0;
      this.engineFilter = c.createBiquadFilter();
      this.engineFilter.type = "lowpass";
      this.engineFilter.frequency.value = 600;
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.applyVolumes();
      void this.load();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (this.wantTrack && this.musicTrack !== this.wantTrack) this.music(this.wantTrack);
  }

  private async load() {
    if (this.loading || !this.ctx) return;
    this.loading = true;
    await Promise.all(SAMPLES.map(async (n) => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}sfx/${n}.mp3`);
        const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(n, buf);
      } catch { /* missing sample: that sound is skipped */ }
    }));
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volume;
    this.fx.gain.value = this.fxVolume;
    this.musicBus.gain.value = this.musicVolume * 0.5;
  }

  /** Attenuate by distance from the listener (0..1). */
  private att(dist: number) { return Math.max(0, 1 - dist / 80) ** 1.4; }

  private play(name: SampleName, gain = 1, rate = 1, minGapMs = 0, detune = 0.06) {
    const c = this.ctx, buf = this.buffers.get(name);
    if (!c || !buf || gain <= 0.01) return;
    const now = performance.now();
    if (minGapMs && now - (this.lastPlay.get(name) ?? 0) < minGapMs) return;
    this.lastPlay.set(name, now);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * detune);
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.fx);
    src.start();
  }

  zap(dist = 0) { const a = this.att(dist); this.play((["gun0", "gun1", "gun2"] as const)[(Math.random() * 3) | 0], 0.32 * a, 1.25, 45); }
  rocket(dist = 0) { const a = this.att(dist); this.play("rocket", 0.55 * a, 0.8); this.play("whoosh", 0.35 * a, 1.4); }
  hornet(dist = 0) { const a = this.att(dist); this.play("hornet", 0.5 * a, 0.9); this.play("whoosh", 0.3 * a, 1.6); }
  lob(dist = 0) { const a = this.att(dist); this.play("lob", 0.7 * a, 0.8); }
  mineDrop(dist = 0) { this.play("mine", 0.6 * this.att(dist), 0.9); }
  boom(size: number, dist = 0) {
    const a = this.att(dist * 0.7);
    if (a <= 0.02) return;
    this.play((["boom0", "boom1", "boom2"] as const)[(Math.random() * 3) | 0], Math.min(1, 0.55 + size * 0.08) * a, 1.05 - Math.min(0.3, size * 0.04));
    if (size >= 3) this.play("boombig", 0.5 * a, 1, 120);
  }
  spark(dist = 0) { this.play("bump", 0.12 * this.att(dist), 2.2, 40); }
  hurt() { this.play("hurt", 0.7, 1.1, 60); }
  hitmarker() { this.play("hitmark", 0.5, 1.4, 50); }
  blocked() { this.play("blocked", 0.4, 1.3, 80); }
  pickup() { this.play("pickup", 0.55); }
  nitro() { this.play("boost", 0.4, 1.3); }
  powerup() { this.play("powerup", 0.55); this.play("shield", 0.3, 1.2); }
  boost() { this.play("boost", 0.5, 1, 300); }
  turbo(tier: number) { this.play("turbo", 0.5, tier > 1 ? 1.2 : 1); }
  hop() { this.play("hop", 0.25, 1.2, 100); }
  land() { this.play("land", 0.45, 1, 120); }
  bump() { this.play("bump", 0.5, 0.9, 120); }
  beep(go = false) { if (go) this.play("go", 0.6, 1, 0, 0); else this.play("beep", 0.55, 1, 0, 0); }
  kill() { this.play("kill", 0.65, 1, 0, 0); }
  wrecked() { this.play("wrecked", 0.65, 1, 0, 0); }
  streak() { this.play("streak", 0.7, 1, 0, 0); }
  victory() { this.play("victory", 0.8, 1, 0, 0); }
  defeat() { this.play("defeat", 0.7, 1, 0, 0); }
  levelUp() { this.play("levelup", 0.8, 1, 0, 0); }
  coins() { this.play("coins", 0.7, 1, 0, 0); }
  spawn() { this.play("spawn", 0.4, 1, 200); }
  click() { this.play("click", 0.5, 1, 30, 0.02); }
  back() { this.play("back", 0.5, 1, 30, 0.02); }
  open() { this.play("open", 0.45, 1, 30, 0.02); }
  confirm() { this.play("confirm", 0.55, 1, 30, 0.02); }

  /** Continuous engine drone following kart speed (0..1+) and boost. */
  engine(speedFrac: number, boosting: boolean, active: boolean) {
    const c = this.ctx;
    if (!c) return;
    if (!this.engineOsc) {
      this.engineOsc = c.createOscillator();
      this.engineOsc.type = "sawtooth";
      this.engineOsc2 = c.createOscillator();
      this.engineOsc2.type = "square";
      this.engineOsc.connect(this.engineFilter);
      this.engineOsc2.connect(this.engineFilter);
      this.engineOsc.start();
      this.engineOsc2.start();
    }
    const t = c.currentTime;
    const sp = Math.min(1.5, Math.abs(speedFrac));
    // gear-ish wobble so the engine note rises in steps instead of a flat siren
    const gear = (sp * 3) % 1;
    const f = 48 + sp * 95 + gear * 22 + (boosting ? 35 : 0);
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.05);
    this.engineOsc2!.frequency.setTargetAtTime(f * 0.5 + 2, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(380 + sp * 800 + (boosting ? 700 : 0), t, 0.08);
    this.engineGain.gain.setTargetAtTime(active ? 0.045 * this.engineVolume * 2 : 0, t, 0.12);
  }

  // ------------------------------------------------------------------ music (original, procedural)

  /** Start/switch the background loop: an upbeat menu groove or a faster race track. */
  music(track: "menu" | "race" | null) {
    this.wantTrack = track;
    const c = this.ctx;
    if (!c) return;
    if (track === this.musicTrack) return;
    this.musicTrack = track;
    if (this.musicTimer !== null) { clearInterval(this.musicTimer); this.musicTimer = null; }
    if (!track) return;
    this.step = 0;
    this.nextNote = c.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.schedule(), 50);
  }

  private schedule() {
    const c = this.ctx;
    if (!c || !this.musicTrack) return;
    const race = this.musicTrack === "race";
    const bpm = race ? 138 : 112;
    const sixteenth = 60 / bpm / 4;
    // I–V–vi–IV in C major (menu) / A minor flavour (race)
    const roots = race ? [57, 53, 48, 55] : [48, 55, 57, 53];
    const chords = race ? [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]] : [[0, 4, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7]];
    while (this.nextNote < c.currentTime + 0.25) {
      const s = this.step % 64, bar = Math.floor(s / 16), beat = s % 16;
      const t = this.nextNote;
      const root = roots[bar], ch = chords[bar];
      if (beat % 4 === 0) this.kick(t);
      if (beat === 4 || beat === 12) this.snare(t);
      if (beat % 2 === 1 || race) this.hat(t, beat % 4 === 2 ? 0.05 : 0.025);
      if (beat % 2 === 0) this.note(t, root - 12 + (beat % 8 === 6 ? 12 : 0), sixteenth * 1.8, "square", 0.05, 900);
      const arp = [0, 1, 2, 1, 2, 1, 0, 2];
      if (race ? true : beat % 2 === 0) this.note(t, root + 12 + ch[arp[beat % 8]], sixteenth * 0.9, "triangle", race ? 0.035 : 0.04, 3000);
      if (beat === 0) for (const iv of ch) this.note(t, root + iv, sixteenth * 15, "sine", 0.018, 1500);
      this.nextNote += sixteenth;
      this.step++;
    }
  }

  private note(t: number, midi: number, dur: number, type: OscillatorType, gain: number, cutoff: number) {
    const c = this.ctx!;
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = type;
    o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    f.type = "lowpass"; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  private kick(t: number) {
    const c = this.ctx!;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.musicBus); o.start(t); o.stop(t + 0.22);
  }
  private noiseBuf: AudioBuffer | null = null;
  private noise(t: number, dur: number, gain: number, hp: number) {
    const c = this.ctx!;
    if (!this.noiseBuf) {
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = "highpass"; f.frequency.value = hp;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.musicBus); s.start(t); s.stop(t + dur + 0.02);
  }
  private snare(t: number) { this.noise(t, 0.16, 0.16, 1500); this.note(t, 50, 0.09, "triangle", 0.08, 2000); }
  private hat(t: number, gain: number) { this.noise(t, 0.04, gain, 7000); }
}

export const sfx = new Sfx();
