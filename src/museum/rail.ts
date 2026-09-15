import * as THREE from "three";

// On-rails tour: the camera advances along a spline via scroll or drag,
// with damping so the motion feels alive rather than robotic.

const POINTS: [number, number, number][] = [
  [0, 1.6, 13.5],
  [-0.6, 1.6, 10.3],
  [0.6, 1.6, 7.2],
  [-1.5, 1.6, 3],
  [2, 1.6, -1],
  [-2, 1.6, -6],
  [-2.2, 1.6, -8.6],
  [2.2, 1.6, -13.6],
  [0, 1.6, -17.5],
  [-2.2, 1.6, -20.5],
  [2.2, 1.6, -24],
  [-2.2, 1.6, -28.5],
  [2.2, 1.6, -32],
  [0, 1.6, -36],
  [-2, 1.6, -42],
  [2, 1.6, -48],
  [0, 1.6, -53],
];

// Speed limits: the target can never run further than this from the camera,
// so an aggressive flick walks the tour instead of teleporting. Forward is
// deliberately slower than backward — advancing is the guided visit and needs
// time for the gaze beats; going back is just a correction.
const MAX_LEAD_FORWARD = 0.034;

// Reused scratch vectors: poseAt runs every frame, and cloning here was a
// steady drip of garbage straight into the GC.
const _pos = new THREE.Vector3();
const _ahead = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _look = new THREE.Vector3();
const MAX_LEAD_BACK = 0.045;

export class Rail {
  curve: THREE.CatmullRomCurve3;
  t = 0;
  private target = 0;
  private active = true;
  private dragging = false;
  private lastY = 0;

  constructor(dom: HTMLElement) {
    this.curve = new THREE.CatmullRomCurve3(
      POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      false,
      "centripetal",
    );

    dom.addEventListener("wheel", (e) => {
      if (!this.active) return;
      this.advance(e.deltaY * (e.deltaY > 0 ? 0.00015 : 0.00022));
    }, { passive: true });

    dom.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.lastY = e.clientY;
    });
    addEventListener("pointerup", () => (this.dragging = false));
    addEventListener("pointermove", (e) => {
      if (!this.active || !this.dragging) return;
      const delta = this.lastY - e.clientY;
      this.lastY = e.clientY;
      this.advance(delta * (delta > 0 ? 0.00055 : 0.0009));
    });
  }

  private advance(delta: number) {
    // Capped short of 1: the curve's final stretch faces the end wall.
    this.target = THREE.MathUtils.clamp(
      THREE.MathUtils.clamp(
        this.target + delta,
        this.t - MAX_LEAD_BACK,
        this.t + MAX_LEAD_FORWARD,
      ),
      0,
      0.96,
    );
  }

  setActive(value: boolean) {
    this.active = value;
    if (value) this.target = this.t;
  }

  // Step used by the on-screen buttons and the keyboard.
  nudge(delta: number) {
    if (!this.active) return;
    this.advance(delta);
  }

  // Points of interest as a fixed itinerary: exhibits are ordered by where
  // they sit along the curve, and the gaze only ever considers the NEXT one.
  // No competition, no side glances — one piece gets full focus, is released,
  // and only then does the following piece exist for the camera.
  private stops: { point: THREE.Vector3; at: number }[] = [];

  setPOIs(points: { point: THREE.Vector3; radius: number }[]) {
    // Order stops by DEPTH along the hall, not by nearest point on the curve:
    // the rail weaves side to side, so projecting an off-axis exhibit onto it
    // clusters distant pieces at the same t (the raptor and the T. rex, 5 m
    // apart, landed 0.02 apart and one never got its turn).
    const SAMPLES = 512;
    const zAt: number[] = [];
    for (let i = 0; i <= SAMPLES; i++) zAt.push(this.curve.getPointAt(i / SAMPLES).z);

    const tForZ = (z: number) => {
      let at = 0;
      let best = Infinity;
      for (let i = 0; i <= SAMPLES; i++) {
        const d = Math.abs(zAt[i] - z);
        if (d < best) { best = d; at = i / SAMPLES; }
      }
      return at;
    };

    const ordered = points
      .map((p) => ({ point: p.point, radius: p.radius, at: tForZ(p.point.z) }))
      .sort((a, b) => a.at - b.at);

    // Merge only ADJACENT SMALL exhibits on the SAME SIDE of the aisle into a
    // shared beat — that is the "two vitrines at once" framing. Large pieces
    // always keep their own beat, and pieces facing each other across the
    // aisle are never merged: their midpoint is empty floor.
    const PAIR_DEPTH = 0.04;
    const SAME_SIDE = 4;
    const SMALL = 1.2;
    const merged: { point: THREE.Vector3; radius: number; at: number }[] = [];
    for (const stop of ordered) {
      const last = merged[merged.length - 1];
      const pairable =
        last &&
        stop.at - last.at < PAIR_DEPTH &&
        Math.abs(stop.point.x - last.point.x) < SAME_SIDE &&
        stop.radius < SMALL &&
        last.radius < SMALL;
      if (pairable) {
        last.point = last.point.clone().lerp(stop.point, 0.5);
        last.at = (last.at + stop.at) / 2;
      } else {
        merged.push({ point: stop.point.clone(), radius: stop.radius, at: stop.at });
      }
    }

    // Where exhibits still crowd each other, the largest one wins its slot:
    // pushing a beat away from its piece makes it fire beside or past it.
    const MIN_GAP = 0.04;
    const spaced: { point: THREE.Vector3; at: number }[] = [];
    let cluster: typeof merged = [];
    const flush = () => {
      if (!cluster.length) return;
      const best = cluster.reduce((a, b) => (b.radius > a.radius ? b : a));
      spaced.push({ point: best.point, at: best.at });
      cluster = [];
    };
    for (const stop of merged) {
      if (cluster.length && stop.at - cluster[0].at >= MIN_GAP) flush();
      cluster.push(stop);
    }
    flush();

    this.stops = spaced;
    this.bakeGaze();
  }

  // --- Gaze as a pure function of position -------------------------------
  //
  // The camera's orientation is BAKED against the rail, not integrated over
  // time. A time-based smoother (gazeDirection.lerp(desired, dt * k)) moves
  // fastest at the very start of every transition and lags behind the input —
  // which is precisely what reads as whiplash and as the camera fighting you.
  //
  // Instead the look-at target is precomputed for the whole tour and then
  // blurred ONCE along the track. Blurring in track space rounds the corners
  // of each turn while leaving its peak intact, so the exhibits stay framed;
  // blurring in time would only ever lag and never arrive. At runtime the
  // camera simply samples the baked curve: scroll fast and it pans fast but
  // smoothly, stop and it stops dead, scroll back and it retraces exactly.
  private gaze: THREE.Vector3[] = [];

  private static readonly SAMPLES = 640;
  private static readonly APPROACH = 0.19;
  private static readonly FULL = 0.105;
  private static readonly FADE = 0.04;
  private static readonly RELEASE = 0.006;
  private static readonly BLUR_PASSES = 3;
  private static readonly BLUR_RADIUS = 9; // samples each side, ~3 m of track

  // Raw target before smoothing: the same itinerary rules as before, but
  // stateless — for a given t the governing stop is simply the first one not
  // yet passed, so it can be evaluated in any order while baking.
  private rawTarget(tc: number, out: THREE.Vector3): THREE.Vector3 {
    const position = this.curve.getPointAt(tc, _pos);
    // A far look-ahead keeps the base target well in front of the camera: a
    // target only a metre away sweeps a huge angle for a small move, which is
    // what made the baked turns spike even at a walking pace.
    const ahead = this.curve.getPointAt(Math.min(tc + 0.07, 1), _ahead);

    if (!this.stops.length) return out.copy(ahead);

    if (tc >= 0.93) {
      let nearest = this.stops[0].point;
      for (const stop of this.stops) {
        if (stop.point.distanceTo(position) < nearest.distanceTo(position)) {
          nearest = stop.point;
        }
      }
      return out.copy(ahead).lerp(nearest, 0.55);
    }

    const stop = this.stops.find((s) => tc <= s.at + Rail.RELEASE);
    if (!stop || tc <= stop.at - Rail.APPROACH) return out.copy(ahead);

    const weight =
      THREE.MathUtils.smoothstep(tc, stop.at - Rail.APPROACH, stop.at - Rail.FULL) *
      (1 - THREE.MathUtils.smoothstep(tc, stop.at - Rail.FADE, stop.at - Rail.RELEASE));

    return out.copy(ahead).lerp(stop.point, Math.min(weight, 1));
  }

  private bakeGaze() {
    const n = Rail.SAMPLES;
    let buffer: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      buffer.push(this.rawTarget(Math.min(i / n, 0.995), new THREE.Vector3()));
    }

    // Separable box blur, repeated — cheap and converges on a gaussian.
    const radius = Rail.BLUR_RADIUS;
    for (let pass = 0; pass < Rail.BLUR_PASSES; pass++) {
      const next: THREE.Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        const acc = new THREE.Vector3();
        let count = 0;
        for (let k = -radius; k <= radius; k++) {
          const j = THREE.MathUtils.clamp(i + k, 0, n);
          acc.add(buffer[j]);
          count++;
        }
        next.push(acc.divideScalar(count));
      }
      buffer = next;
    }
    this.gaze = buffer;
  }

  poseAt(t: number): { position: THREE.Vector3; lookTarget: THREE.Vector3 } {
    const tc = THREE.MathUtils.clamp(t, 0, 0.995);
    const position = this.curve.getPointAt(tc, _pos);
    if (!this.gaze.length) {
      return { position, lookTarget: this.curve.getPointAt(Math.min(tc + 0.02, 1), _ahead) };
    }

    const x = tc * Rail.SAMPLES;
    const i = Math.min(Rail.SAMPLES - 1, Math.floor(x));
    const lookTarget = _look.copy(this.gaze[i]).lerp(this.gaze[i + 1], x - i);
    return { position, lookTarget };
  }

  update(camera: THREE.PerspectiveCamera, dt: number) {
    if (!this.active) return;
    this.t += (this.target - this.t) * Math.min(1, dt * 1.25);
    const { position, lookTarget } = this.poseAt(this.t);
    camera.position.copy(position);
    camera.lookAt(lookTarget);
  }
}
