import * as THREE from "three";

// On-rails tour: the camera advances along a spline via scroll or drag,
// with damping so the motion feels alive rather than robotic.

const POINTS: [number, number, number][] = [
  [0, 1.6, 7.5],
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

  // Points of interest: while touring, the gaze leans toward the nearest
  // exhibit and releases as you pass it. Tuned as a gentle bias, not a lock:
  // capped weight, a distance band that lets go before the piece is on top of
  // you, and hysteresis so the target never ping-pongs between sides.
  private pois: THREE.Vector3[] = [];
  private gazeDirection: THREE.Vector3 | null = null;
  private currentPOI: THREE.Vector3 | null = null;

  setPOIs(points: THREE.Vector3[]) {
    this.pois = points;
  }

  private poiWeight(poi: THREE.Vector3, position: THREE.Vector3, forward: THREE.Vector3): number {
    const offset = poi.clone().sub(position).setY(0);
    const distance = offset.length();
    if (distance < 2.2 || distance > 9) return 0;
    if (offset.normalize().dot(forward) < 0.35) return 0; // too lateral or behind
    // Band: ramps in approaching, lets go again when about to pass.
    return (
      THREE.MathUtils.smoothstep(9 - distance, 0, 3) *
      THREE.MathUtils.smoothstep(distance - 2.2, 0, 1.6)
    );
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
    if (tc >= 0.93 && this.pois.length) {
      let nearest = this.pois[0];
      for (const poi of this.pois) {
        if (poi.distanceTo(position) < nearest.distanceTo(position)) nearest = poi;
      }
      return { position, lookTarget: ahead.clone().lerp(nearest, 0.55) };
    }

    let best: THREE.Vector3 | null = null;
    let bestWeight = 0;
    for (const poi of this.pois) {
      let weight = this.poiWeight(poi, position, forward);
      if (poi === this.currentPOI) weight *= 1.2; // sticky: no ping-pong
      if (weight > bestWeight) {
        bestWeight = weight;
        best = poi;
      }
    }
    this.currentPOI = bestWeight > 0.1 ? best : null;

    const gazeStrength = Math.min(bestWeight, 1) * 0.35 * (1 - cruise * 0.85);
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
    this.gazeDirection.lerp(desired, Math.min(1, dt * 2.2)).normalize();

    camera.position.copy(position);
    camera.lookAt(
      position.x + this.gazeDirection.x * 6,
      position.y + this.gazeDirection.y * 6,
      position.z + this.gazeDirection.z * 6,
    );
  }
}
