import type * as THREE from "three";
import type { Rail } from "./rail";

// Performance HUD, enabled with ?perf. Beyond a plain FPS counter it maps the
// WORST frame time seen at each point of the tour, so a hitch that happens
// once while walking past a piece is still visible afterwards — an average
// would hide exactly the spikes we are hunting.

const BUCKETS = 60;

export class Perf {
  private worstMs = new Float32Array(BUCKETS); // worst frame time per bucket
  private lastMs = new Float32Array(BUCKETS);
  private frames = 0;
  private acc = 0;
  private fps = 0;
  private peak = 0;
  private last = performance.now();
  private root: HTMLElement;
  private readout: HTMLElement;
  private bars: HTMLElement[] = [];

  constructor(private renderer: THREE.WebGLRenderer, private rail: Rail) {
    this.root = document.createElement("div");
    this.root.id = "perf";
    this.root.innerHTML = `
      <div class="perfTop"><span id="perfNow">–</span><span id="perfMeta"></span></div>
      <div class="perfMap"></div>
      <div class="perfFoot">peor fotograma por tramo del recorrido · doble clic para reiniciar</div>`;
    document.body.appendChild(this.root);
    this.readout = this.root.querySelector("#perfNow") as HTMLElement;

    const map = this.root.querySelector(".perfMap") as HTMLElement;
    for (let i = 0; i < BUCKETS; i++) {
      const bar = document.createElement("i");
      map.appendChild(bar);
      this.bars.push(bar);
    }
    this.root.ondblclick = () => {
      this.worstMs.fill(0);
      this.peak = 0;
    };
  }

  update() {
    const now = performance.now();
    const ms = now - this.last;
    this.last = now;

    // Ignore the first frames and any tab-switch gap.
    if (ms < 500) {
      const bucket = Math.min(
        BUCKETS - 1,
        Math.max(0, Math.floor(this.rail.t * BUCKETS)),
      );
      this.lastMs[bucket] = ms;
      if (ms > this.worstMs[bucket]) this.worstMs[bucket] = ms;
      if (ms > this.peak) this.peak = ms;
      this.acc += ms;
      this.frames++;
    }

    if (this.frames >= 15) {
      this.fps = 1000 / (this.acc / this.frames);
      this.acc = 0;
      this.frames = 0;
      this.paint();
    }
  }

  private paint() {
    const info = this.renderer.info.render;
    this.readout.textContent = `${this.fps.toFixed(0)} fps`;
    this.readout.className = this.fps >= 50 ? "ok" : this.fps >= 30 ? "warn" : "bad";
    (this.root.querySelector("#perfMeta") as HTMLElement).textContent =
      `pico ${this.peak.toFixed(0)} ms · ${info.calls} draw · ${(info.triangles / 1000).toFixed(0)}k tri`;

    const here = Math.min(BUCKETS - 1, Math.floor(this.rail.t * BUCKETS));
    for (let i = 0; i < BUCKETS; i++) {
      const worst = this.worstMs[i];
      const bar = this.bars[i];
      // 16.7 ms = 60 fps is full green; 50 ms and up is full red.
      const height = worst ? Math.min(100, (worst / 50) * 100) : 0;
      bar.style.height = `${Math.max(height, worst ? 6 : 0)}%`;
      bar.style.background = !worst
        ? "transparent"
        : worst > 33 ? "#e5484d"
        : worst > 20 ? "#e8c37a"
        : "#4a9d6a";
      bar.style.outline = i === here ? "1px solid #e6edf3" : "none";
    }
  }

  // Dump the map so a run can be pasted into a report.
  profile() {
    return Array.from(this.worstMs, (worst, i) => ({
      t: +(i / BUCKETS).toFixed(3),
      worstMs: +worst.toFixed(1),
      lastMs: +this.lastMs[i].toFixed(1),
    })).filter((row) => row.worstMs > 0);
  }
}
