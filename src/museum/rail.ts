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
  [1.6, 1.6, -9.6],
  [0, 1.6, -13],
  [2, 1.6, -18],
  [-2, 1.6, -24],
  [1.5, 1.6, -30],
  [0, 1.6, -36],
  [-2, 1.6, -42],
  [2, 1.6, -48],
  [0, 1.6, -53],
];

// Speed limits: the target can never run further than this from the camera,
// so an aggressive flick walks the tour instead of teleporting. Forward is
// deliberately slower than backward — advancing is the guided visit and needs
// time for the gaze beats; going back is just a correction.
const MAX_LEAD_FORWARD = 0.028;
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
  private nextStop = 0;
  private gazeDirection: THREE.Vector3 | null = null;
  private currentPOI: THREE.Vector3 | null = null;
  private lastT = 0;

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
    this.nextStop = 0;
  }

  // cruise: 0 strolling, 1 at full speed. Fast travel damps the exhibit gaze
  // so the camera simply looks down the path instead of whipping sideways.
  poseAt(t: number, cruise = 0): { position: THREE.Vector3; lookTarget: THREE.Vector3 } {
    const tc = THREE.MathUtils.clamp(t, 0, 0.995);
    const position = this.curve.getPointAt(tc);
    const ahead = this.curve.getPointAt(Math.min(tc + 0.02, 1));
    const forward = ahead.clone().sub(position).setY(0).normalize();

    // Entrance breather: the first steps look straight ahead so the visitor
    // reads the hall sign before the first exhibit claims the gaze.
    if (tc < 0.035) return { position, lookTarget: ahead };

    // End of the tour: settle the gaze on the closest piece instead of
    // letting the camera drift onto the back wall.
    if (tc >= 0.93 && this.stops.length) {
      let nearest = this.stops[0].point;
      for (const stop of this.stops) {
        if (stop.point.distanceTo(position) < nearest.distanceTo(position)) {
          nearest = stop.point;
        }
      }
      return { position, lookTarget: ahead.clone().lerp(nearest, 0.55) };
    }

    // Strict itinerary, driven by position ALONG THE RAIL rather than 3D
    // distance: each stop owns a window that opens before it and closes just
    // after, so engagement is monotonic and cannot flicker or ping-pong.
    // The beat plays on APPROACH and fades before the closest pass: at the
    // nearest point a 5 m skeleton no longer fits the frame, and looking
    // sideways at something you are already beside feels unnatural.
    const APPROACH = 0.145;  // window opens this far before the stop
    const FULL = 0.088;      // fully engaged from here
    const FADE = 0.028;      // starts letting go here
    const RELEASE = 0.006;   // free again just before passing

    // Only resync backward when the visitor is actually walking back.
    if (tc < this.lastT - 1e-4) {
      while (this.nextStop > 0 && tc < this.stops[this.nextStop - 1].at - RELEASE) {
        this.nextStop--;
      }
    }
    this.lastT = tc;

    // Skip any stop already left behind.
    while (this.nextStop < this.stops.length && tc > this.stops[this.nextStop].at + RELEASE) {
      this.nextStop++;
    }

    const stop = this.stops[this.nextStop];
    let bestWeight = 0;
    if (stop && tc > stop.at - APPROACH) {
      bestWeight =
        THREE.MathUtils.smoothstep(tc, stop.at - APPROACH, stop.at - FULL) *
        (1 - THREE.MathUtils.smoothstep(tc, stop.at - FADE, stop.at - RELEASE));
      this.currentPOI = bestWeight > 0.02 ? stop.point : null;
    } else {
      this.currentPOI = null;
    }

    // Cruise damping only bites at true flick speeds; a normal stroll or a
    // held button keeps the full museum gaze.
    const flick = THREE.MathUtils.smoothstep(cruise, 0.55, 1);
    const gazeStrength = Math.min(bestWeight, 1) * 0.85 * (1 - flick * 0.75);
    const lookTarget = this.currentPOI
      ? ahead.clone().lerp(this.currentPOI, gazeStrength)
      : ahead;
    return { position, lookTarget };
  }

  update(camera: THREE.PerspectiveCamera, dt: number) {
    if (!this.active) return;
    this.t += (this.target - this.t) * Math.min(1, dt * 2.2);
    const cruise = THREE.MathUtils.clamp(
      Math.abs(this.target - this.t) / MAX_LEAD_FORWARD,
      0,
      1,
    );
    const { position, lookTarget } = this.poseAt(this.t, cruise);

    // Smooth the gaze as a DIRECTION, never as a point in space: a lagging
    // point can end up beside the camera and slam the view into the floor.
    const desired = lookTarget.sub(position).normalize();
    if (!this.gazeDirection) this.gazeDirection = desired.clone();
    this.gazeDirection.lerp(desired, Math.min(1, dt * 3.2)).normalize();

    camera.position.copy(position);
    camera.lookAt(
      position.x + this.gazeDirection.x * 6,
      position.y + this.gazeDirection.y * 6,
      position.z + this.gazeDirection.z * 6,
    );
  }
}
