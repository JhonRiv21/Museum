import * as THREE from "three";
import { HALLS } from "./data";

// Frame probe, localhost only. Records every frame of a tour against WHERE it
// happened — rail position, camera axes, hall and nearest exhibit — so a drop
// can be traced to a spot in the museum instead of a vague "it stutters".
//
// It lives in its own module and hooks requestAnimationFrame, so mounting it
// costs a single line in main.ts and nothing inside the render loop.

type Deps = {
  rail: { t: number };
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  // Exhibits keeps its pieces private; main.ts hands over (id, centre) pairs
  // through the public accessor so this module never reaches into it.
  pieces: () => { id: string; center: THREE.Vector3 }[];
};

// [t, ms, x, y, z, draws, ktri] — tuples, not objects: a full tour is a few
// thousand frames and named keys would triple the file for no information.
type Frame = [number, number, number, number, number, number, number];

type Run = {
  index: number;
  startedAt: string;
  durationMs: number;
  frames: Frame[];
};

const BUCKETS = 200;
// Just short of where the rail stops (0.985): the finale is the last thing a
// visitor sees and must be inside the recording. At 0.95 every run was cut at
// z = -52 and the last two exhibits were never measured.
const END_T = 0.98;
// A run must START near the entrance and the probe re-arms only once the
// visitor is back there. Re-arming at the finish line made every following
// frame open and close a new one-frame "run" — hundreds per second.
const START_T = 0.03;
const REARM_T = 0.01;
const MIN_FRAMES = 60;
// Completed runs survive a reload: reloading is the quickest way back to the
// entrance, and it used to wipe everything recorded so far.
const STORE_KEY = "museo-probe-runs";
const round = (v: number, d = 2) => +v.toFixed(d);
// The render loop runs at a fixed rate (30 fps unless ?fps= says otherwise), so
// "slow" means a frame that missed that deadline, not one over 33 ms: at 30 fps
// every frame is 33.3 ms by design. 20% of margin absorbs vsync jitter.
const TARGET_FPS = Number(new URLSearchParams(location.search).get("fps")) || 30;
const SLOW_MS = (1000 / TARGET_FPS) * 1.2;

function hallAt(z: number): string {
  return (HALLS.find((h) => z > h.untilZ) ?? HALLS[HALLS.length - 1]).name;
}

export function mountProbe(deps: Deps) {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) ||
    location.hostname.endsWith(".localhost");
  if (!local) return;

  const { rail, camera, renderer, pieces } = deps;
  const runs: Run[] = [];
  try {
    const saved = sessionStorage.getItem(STORE_KEY);
    if (saved) runs.push(...(JSON.parse(saved) as Run[]));
  } catch { /* storage unavailable or corrupt: start empty */ }
  const persist = () => {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(runs)); }
    catch { $("pbStat").textContent = "no se pudo guardar en la sesión — descarga ya"; }
  };
  let current: Run | null = null;
  let runStart = 0;
  // waiting: parked at the entrance · recording · done: finished, waiting to
  // be brought back to the entrance before another run can start.
  let phase: "waiting" | "recording" | "done" = "waiting";
  let paused = false;
  let last = 0;
  let fps = 0, acc = 0, n = 0;
  // Live view while recording, kept incrementally: recomputing buckets over the
  // whole run every few frames cost milliseconds mid-walk — the probe would
  // have been causing the very stutter it was recording.
  const liveWorst = new Float32Array(60);
  let liveFrames = 0, liveOver33 = 0;

  const el = document.createElement("div");
  el.id = "probe";
  el.innerHTML = `
    <div class="pbHead">
      <span class="pbDot"></span><b id="pbFps">–</b>
      <span id="pbWhere">esperando recorrido</span>
      <span class="pbGrow"></span>
      <span id="pbRuns"></span>
      <button id="pbToggle" title="Expandir">▴</button>
    </div>
    <div class="pbBody" hidden>
      <div class="pbAxes">
        <span>t <b id="pbT">0.000</b></span>
        <span>x <b id="pbX">0.0</b></span>
        <span>y <b id="pbY">0.0</b></span>
        <span>z <b id="pbZ">0.0</b></span>
        <span>cerca <b id="pbNear">–</b></span>
      </div>
      <div class="pbMap" id="pbMap"></div>
      <div class="pbFoot">
        <span id="pbStat">sin datos</span>
        <span class="pbGrow"></span>
        <button id="pbSave">Descargar JSON</button>
        <button id="pbCopy">Copiar resumen</button>
        <button id="pbClear">Reiniciar</button>
      </div>
    </div>`;
  document.body.appendChild(el);

  const style = document.createElement("style");
  style.textContent = `
    #probe{position:fixed;left:12px;bottom:12px;z-index:60;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;
      color:#e6edf3;background:rgba(12,16,22,.92);border:1px solid #2a3442;border-radius:10px;
      backdrop-filter:blur(8px);min-width:260px;max-width:min(520px,calc(100vw - 24px));user-select:none}
    #probe .pbHead{display:flex;align-items:center;gap:8px;padding:8px 10px}
    #probe .pbDot{width:8px;height:8px;border-radius:50%;background:#4a9d6a;flex:none}
    #probe.rec .pbDot{background:#e5484d;animation:pbPulse 1s infinite}
    @keyframes pbPulse{50%{opacity:.25}}
    #probe b{font-weight:600}
    #probe #pbFps{min-width:52px}
    #probe #pbWhere{color:#9fb0c3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #probe .pbGrow{flex:1}
    #probe #pbRuns{color:#e8c37a}
    #probe button{background:#1b2430;color:#e6edf3;border:1px solid #2a3442;border-radius:6px;
      padding:3px 8px;cursor:pointer;font:inherit}
    #probe button:hover{background:#243040}
    #probe .pbBody{border-top:1px solid #2a3442;padding:8px 10px}
    #probe .pbAxes{display:flex;flex-wrap:wrap;gap:10px;color:#9fb0c3;margin-bottom:8px}
    #probe .pbAxes b{color:#e6edf3}
    #probe .pbMap{display:flex;align-items:flex-end;gap:1px;height:46px;margin-bottom:8px}
    #probe .pbMap i{flex:1;min-width:1px;background:#2a3442;border-radius:1px 1px 0 0}
    #probe .pbFoot{display:flex;align-items:center;gap:6px;color:#9fb0c3}`;
  document.head.appendChild(style);

  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  const body = el.querySelector(".pbBody") as HTMLElement;
  const map = $("pbMap");
  const bars: HTMLElement[] = [];
  for (let i = 0; i < 60; i++) { const b = document.createElement("i"); map.appendChild(b); bars.push(b); }

  $("pbToggle").onclick = () => {
    body.hidden = !body.hidden;
    $("pbToggle").textContent = body.hidden ? "▴" : "▾";
  };
  $("pbClear").onclick = () => {
    runs.length = 0; current = null; phase = "waiting"; el.classList.remove("rec");
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* nothing to clear */ }
    refresh();
  };
  $("pbSave").onclick = () => download();
  $("pbCopy").onclick = () => {
    navigator.clipboard.writeText(JSON.stringify(summary(), null, 1));
    $("pbStat").textContent = "resumen copiado";
  };

  function nearestPiece(): string {
    let best = "–", d = Infinity;
    for (const p of pieces()) {
      const k = p.center.distanceTo(camera.position);
      if (k < d) { d = k; best = p.id; }
    }
    return d < 18 ? `${best} (${d.toFixed(1)}m)` : "–";
  }

  // Buckets by rail position: this is what turns "it stutters" into a place.
  function bucketsOf(run: Run) {
    const out: any[] = [];
    for (let i = 0; i < BUCKETS; i++) {
      const a = i / BUCKETS, b = (i + 1) / BUCKETS;
      const f = run.frames.filter((x) => x[0] >= a && x[0] < b);
      if (!f.length) continue;
      const ms = f.map((x) => x[1]).sort((p, q) => p - q);
      const mid = f[f.length >> 1];
      out.push({
        t: round(a, 3), z: round(mid[4], 1), x: round(mid[2], 1),
        sala: hallAt(mid[4]),
        fotogramas: f.length,
        mediana: round(ms[ms.length >> 1], 1),
        p95: round(ms[Math.floor(ms.length * 0.95)], 1),
        peor: round(ms[ms.length - 1], 1),
        lentos: ms.filter((v) => v > SLOW_MS).length,
        sobre50: ms.filter((v) => v > 50).length,
        draws: mid[5], ktri: mid[6],
      });
    }
    return out;
  }

  function stats(run: Run) {
    const ms = run.frames.map((f) => f[1]).sort((a, b) => a - b);
    if (!ms.length) return null;
    return {
      fotogramas: ms.length,
      mediana: round(ms[ms.length >> 1], 1),
      fps_mediano: Math.round(1000 / ms[ms.length >> 1]),
      p95: round(ms[Math.floor(ms.length * 0.95)], 1),
      p99: round(ms[Math.floor(ms.length * 0.99)], 1),
      peor: round(ms[ms.length - 1], 1),
      lentos: ms.filter((v) => v > SLOW_MS).length,
      umbral_lento_ms: round(SLOW_MS, 1),
      sobre50: ms.filter((v) => v > 50).length,
      sobre100: ms.filter((v) => v > 100).length,
    };
  }

  function entorno() {
    const gl = renderer.getContext();
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      fecha: new Date().toISOString(),
      objetivo_fps: TARGET_FPS,
      url: location.href,
      pixelRatio: renderer.getPixelRatio(),
      lienzo: [renderer.domElement.width, renderer.domElement.height],
      ventana: [innerWidth, innerHeight],
      megapixeles: round((renderer.domElement.width * renderer.domElement.height) / 1e6, 2),
      piezas: pieces().length,
      // Which pieces, not just how many: two states can hold the same count.
      ids: pieces().map((p) => p.id).sort(),
      gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "n/d",
      memoria_js: (performance as any).memory
        ? round((performance as any).memory.usedJSHeapSize / 1048576, 0) + " MB" : "n/d",
    };
  }

  function summary() {
    return {
      entorno: entorno(),
      recorridos: runs.map((r) => ({
        recorrido: r.index, duracion_s: round(r.durationMs / 1000, 1), ...stats(r),
        peores_puntos: bucketsOf(r).sort((a, b) => b.peor - a.peor).slice(0, 10)
          .map((b) => ({ t: b.t, z: b.z, sala: b.sala, peor: b.peor, mediana: b.mediana })),
      })),
    };
  }

  function fullReport() {
    return {
      entorno: entorno(),
      recorridos: runs.map((r) => ({
        recorrido: r.index, inicio: r.startedAt, duracion_s: round(r.durationMs / 1000, 1),
        resumen: stats(r),
        tramos: bucketsOf(r),
        peores_fotogramas: r.frames.slice().sort((a, b) => b[1] - a[1]).slice(0, 40)
          .map((f) => ({ t: round(f[0], 3), ms: round(f[1], 1), x: round(f[2], 1), z: round(f[4], 1), sala: hallAt(f[4]), draws: f[5], ktri: f[6] })),
        crudo: { campos: ["t", "ms", "x", "y", "z", "draws", "ktri"], datos: r.frames },
      })),
    };
  }

  function download() {
    if (!runs.length) { $("pbStat").textContent = "aún no hay recorridos"; return; }
    const blob = new Blob([JSON.stringify(fullReport())], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `museo-perf-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    $("pbStat").textContent = `descargado · ${runs.length} recorrido(s)`;
  }

  function refresh() {
    $("pbRuns").textContent = runs.length ? `${runs.length} recorrido(s)` : "";
    if (current) {
      $("pbStat").textContent = `grabando #${current.index}: ${liveFrames} fotogramas · lentos ${liveOver33}`;
      paint(liveWorst);
      return;
    }
    const r = runs[runs.length - 1];
    if (!r) { paint(new Float32Array(60)); return; }
    const worst = new Float32Array(60);
    for (const f of r.frames) { const i = Math.min(59, Math.floor(f[0] * 60)); if (f[1] > worst[i]) worst[i] = f[1]; }
    paint(worst);
  }

  function paint(worst: Float32Array) {
    for (let i = 0; i < bars.length; i++) {
      const peor = worst[i];
      bars[i].style.height = peor ? `${Math.min(100, (peor / 60) * 100)}%` : "0";
      bars[i].style.background = !peor ? "#2a3442"
        : peor > SLOW_MS * 1.4 ? "#e5484d" : peor > SLOW_MS ? "#e8c37a" : "#4a9d6a";
    }
  }

  refresh();
  if (runs.length) $("pbStat").textContent = `${runs.length} recorrido(s) recuperado(s) de esta sesión`;

  // Frame capture. Wrapping rAF catches the renderer's own loop without the
  // loop knowing about us.
  const raf = window.requestAnimationFrame.bind(window);
  // The render loop wakes on every vsync but only draws at its own fixed rate.
  // A tick where nothing was drawn is not a frame the visitor saw, so only
  // ticks that advanced the renderer's frame counter are recorded.
  let drawn = renderer.info.render.frame;
  window.requestAnimationFrame = (cb: FrameRequestCallback) =>
    raf((ts) => {
      cb(ts);
      const frame = renderer.info.render.frame;
      if (frame === drawn) return;
      drawn = frame;
      if (last) {
        const ms = ts - last;
        acc += ms; n++;
        if (n >= 12) { fps = 1000 / (acc / n); acc = 0; n = 0; }

        const t = rail.t;
        if (phase === "done" && t < REARM_T) phase = "waiting";
        if (!paused && phase === "waiting" && t > 0.002 && t < START_T) {
          current = { index: runs.length + 1, startedAt: new Date().toISOString(), durationMs: 0, frames: [] };
          runStart = ts; phase = "recording";
          liveWorst.fill(0); liveFrames = 0; liveOver33 = 0;
          el.classList.add("rec");
        }
        if (current && !paused && ms < 2000) {
          const p = camera.position, info = renderer.info.render;
          current.frames.push([t, round(ms, 1), round(p.x, 2), round(p.y, 2), round(p.z, 2),
            info.calls, Math.round(info.triangles / 1000)]);
          current.durationMs = ts - runStart;
          const slot = Math.min(59, Math.floor(t * 60));
          if (ms > liveWorst[slot]) liveWorst[slot] = ms;
          liveFrames++; if (ms > SLOW_MS) liveOver33++;
          if (t >= END_T) {
            el.classList.remove("rec");
            // Only a run with real content is kept; a stray start is dropped.
            if (current.frames.length >= MIN_FRAMES) { runs.push(current); persist(); }
            current = null; phase = "done";
            refresh();
            $("pbStat").textContent = runs.length
              ? `recorrido ${runs.length} completo — vuelve al inicio para otro, o Descargar`
              : "recorrido demasiado corto, descartado";
          }
        }
        if (n === 0) {
          $("pbFps").textContent = `${Math.round(fps)} fps`;
          ($("pbFps") as HTMLElement).style.color = fps >= TARGET_FPS * 0.95 ? "#4a9d6a" : fps >= TARGET_FPS * 0.7 ? "#e8c37a" : "#e5484d";
          $("pbWhere").textContent = `${hallAt(camera.position.z)}${current ? " · grabando" : ""}`;
          if (!body.hidden) {
            $("pbT").textContent = t.toFixed(3);
            $("pbX").textContent = camera.position.x.toFixed(1);
            $("pbY").textContent = camera.position.y.toFixed(1);
            $("pbZ").textContent = camera.position.z.toFixed(1);
            $("pbNear").textContent = nearestPiece();
            if (current) refresh();
          }
        }
      }
      last = ts;
    });

  Object.assign(window, { __probe: { runs, fullReport, summary, download, pause: (v: boolean) => (paused = v) } });
}
