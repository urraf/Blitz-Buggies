import * as THREE from "three";

// Procedural canvas textures: everything is drawn at runtime, nothing is downloaded.

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")!] as const;
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) { t = make(); cache.set(key, t); }
  return t;
}

function finish(c: HTMLCanvasElement, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Smooth asphalt / track / ice tile with faint speckles. */
export function surfaceTexture(base: string, alt: string, kind: "road" | "track" | "ice") {
  return cached(`surf:${base}:${alt}:${kind}`, () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    if (kind === "track") {
      // broad soft stripes, like a painted sports court
      g.fillStyle = alt;
      for (let i = 0; i < 4; i += 2) g.fillRect(0, i * 64, 256, 64);
    } else if (kind === "ice") {
      g.strokeStyle = alt; g.lineWidth = 2; g.globalAlpha = 0.7;
      for (let i = 0; i < 18; i++) {
        g.beginPath();
        const x = Math.random() * 256, y = Math.random() * 256;
        g.moveTo(x, y); g.quadraticCurveTo(x + 30, y + 10, x + 60 * Math.random(), y + 40 * Math.random());
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    // speckles
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.045)";
      const s = 1 + Math.random() * 2;
      g.fillRect(Math.random() * 256, Math.random() * 256, s, s);
    }
    return finish(c);
  });
}

/** Two-tone checker grass (repeat 1 tile = 4 m). */
export function grassTexture(a = "#5fd35a", b = "#53c650") {
  return cached(`grass:${a}:${b}`, () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = a; g.fillRect(0, 0, 128, 128);
    g.fillStyle = b; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
    return finish(c);
  });
}

export function stripeTexture(a: string, b: string) {
  return cached(`stripe:${a}:${b}`, () => {
    const [c, g] = canvas(64, 64);
    g.fillStyle = a; g.fillRect(0, 0, 64, 64);
    g.fillStyle = b;
    for (let i = -64; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 + 64, 64); g.lineTo(i + 64, 64); g.fill(); }
    return finish(c);
  });
}

/** Zig-zag frosting for candy ramps and cake tops. */
export function zigzagTexture(a: string, b: string) {
  return cached(`zig:${a}:${b}`, () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = a; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = b; g.lineWidth = 12; g.lineJoin = "round";
    for (let y = 16; y < 160; y += 40) {
      g.beginPath();
      for (let x = -16, up = true; x <= 144; x += 32, up = !up) g.lineTo(x, y + (up ? -12 : 12));
      g.stroke();
    }
    return finish(c);
  });
}

/** Painted floor decals. All white-on-transparent unless noted. */
export function paintTexture(kind: "zebra" | "dash" | "kerb" | "grass" | "lane" | "zigzag") {
  return cached(`paint:${kind}`, () => {
    const [c, g] = canvas(64, 64);
    if (kind === "zebra") { g.fillStyle = "rgba(255,255,255,0.92)"; for (let y = 4; y < 64; y += 16) g.fillRect(0, y, 64, 8); }
    else if (kind === "dash") { g.fillStyle = "rgba(255,255,255,0.9)"; g.fillRect(0, 0, 64, 38); }
    else if (kind === "lane") { g.fillStyle = "rgba(255,255,255,0.85)"; g.fillRect(0, 0, 64, 64); }
    else if (kind === "kerb") { g.fillStyle = "#ffffff"; g.fillRect(0, 0, 64, 64); g.fillStyle = "#ff4d5e"; g.fillRect(0, 0, 64, 32); }
    else if (kind === "grass") { g.fillStyle = "#5fd35a"; g.fillRect(0, 0, 64, 64); g.fillStyle = "#53c650"; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32); }
    else { g.fillStyle = "#ff6fb5"; g.fillRect(0, 0, 64, 64); g.strokeStyle = "#ffd1e6"; g.lineWidth = 7; g.beginPath(); for (let x = 0, up = true; x <= 64; x += 16, up = !up) g.lineTo(x, up ? 20 : 44); g.stroke(); }
    return finish(c);
  });
}

export function chevronTexture(color: string, bg = "#5a2bb5") {
  return cached(`chev:${color}:${bg}`, () => {
    const [c, g] = canvas(128, 256);
    g.fillStyle = bg; g.fillRect(0, 0, 128, 256);
    g.fillStyle = color;
    for (let y = 16; y < 256; y += 80) {
      g.beginPath(); g.moveTo(16, y + 48); g.lineTo(64, y); g.lineTo(112, y + 48); g.lineTo(112, y + 72); g.lineTo(64, y + 24); g.lineTo(16, y + 72); g.closePath(); g.fill();
    }
    const t = finish(c);
    t.wrapS = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** Mystery crate face: sunny yellow box, blue panel, white "?". */
export function crateTexture() {
  return cached("crate", () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = "#ffcf3a"; g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#ffe07a"; g.fillRect(0, 0, 128, 14); g.fillRect(0, 0, 14, 128);
    g.fillStyle = "#e9a91a"; g.fillRect(0, 114, 128, 14); g.fillRect(114, 0, 14, 128);
    g.fillStyle = "#2f7bff";
    g.beginPath(); g.roundRect(26, 26, 76, 76, 14); g.fill();
    g.fillStyle = "#fff"; g.font = "900 70px 'Baloo 2', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("?", 64, 70);
    return finish(c, false);
  });
}

/** Cartoon water: deep cyan with lighter wave squiggles (scrolled in the shader via offset). */
export function waterTexture(base: string, line: string) {
  return cached(`water:${base}:${line}`, () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = line; g.lineWidth = 5; g.lineCap = "round";
    for (let i = 0; i < 26; i++) {
      const x = (i * 97) % 256, y = (i * 53) % 256;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 14, y - 8, x + 28, y); g.quadraticCurveTo(x + 42, y + 8, x + 56, y); g.stroke();
    }
    return finish(c);
  });
}

export function nameTexture(name: string, color: string) {
  const [c, g] = canvas(256, 64);
  g.font = "800 34px 'Baloo 2', sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 7; g.strokeStyle = "rgba(10,8,30,0.85)";
  g.strokeText(name, 128, 34);
  g.fillStyle = color; g.fillText(name, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function sparkleTexture() {
  return cached("sparkle", () => {
    const [c, g] = canvas(64, 64);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.25, "rgba(255,255,255,0.6)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#fff";
    g.beginPath(); g.moveTo(32, 2); g.lineTo(36, 28); g.lineTo(62, 32); g.lineTo(36, 36); g.lineTo(32, 62); g.lineTo(28, 36); g.lineTo(2, 32); g.lineTo(28, 28); g.closePath(); g.fill();
    return new THREE.CanvasTexture(c);
  });
}

/** Molten lava: dark red base, orange blobs and bright cracks (scrolled for motion). */
export function lavaTexture() {
  return cached("lava", () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = "#c2260f"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 60; i++) {
      const x = (i * 73) % 256, y = (i * 41) % 256, r = 10 + (i % 5) * 7;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, i % 3 ? "#ffb703" : "#ffe066"); grad.addColorStop(1, "rgba(255,90,0,0)");
      g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = "#ffd23f"; g.lineWidth = 3; g.globalAlpha = 0.7;
    for (let i = 0; i < 14; i++) { g.beginPath(); const x = (i * 97) % 256, y = (i * 59) % 256; g.moveTo(x, y); g.lineTo(x + 30, y + 12); g.lineTo(x + 48, y - 6); g.stroke(); }
    return finish(c);
  });
}

/** Soft dark blast mark for explosion decals. */
export function scorchTexture() {
  return cached("scorch", () => {
    const [c, g] = canvas(128, 128);
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, "rgba(20,16,30,0.75)"); grad.addColorStop(0.55, "rgba(30,24,40,0.45)"); grad.addColorStop(1, "rgba(30,24,40,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.strokeStyle = "rgba(20,16,30,0.35)"; g.lineWidth = 4;
      g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); g.stroke();
    }
    return new THREE.CanvasTexture(c);
  });
}
