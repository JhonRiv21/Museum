import * as THREE from "three";

// On-rails tour: the camera advances along a spline via scroll or drag,
// with damping so the motion feels alive rather than robotic.

const POINTS: [number, number, number][] = [
  [0, 1.6, 7.5],
  [-1.5, 1.6, 3],
  [2, 1.6, -1],
  [-2, 1.6, -6],
  [0, 1.6, -12],
  [2, 1.6, -18],
  [-2, 1.6, -24],
  [1.5, 1.6, -30],
  [0, 1.6, -36],
  [-2, 1.6, -42],
  [2, 1.6, -48],
  [0, 1.6, -53],
];

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
      this.target = THREE.MathUtils.clamp(this.target + e.deltaY * 0.00022, 0, 1);
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
      this.target = THREE.MathUtils.clamp(this.target + delta * 0.0009, 0, 1);
    });
  }

  setActive(value: boolean) {
    this.active = value;
    if (value) this.target = this.t;
  }

  poseAt(t: number): { position: THREE.Vector3; lookTarget: THREE.Vector3 } {
    const tc = THREE.MathUtils.clamp(t, 0, 0.995);
    return {
      position: this.curve.getPointAt(tc),
      lookTarget: this.curve.getPointAt(Math.min(tc + 0.02, 1)),
    };
  }

  update(camera: THREE.PerspectiveCamera, dt: number) {
    if (!this.active) return;
    this.t += (this.target - this.t) * Math.min(1, dt * 2.2);
    const { position, lookTarget } = this.poseAt(this.t);
    camera.position.copy(position);
    camera.lookAt(lookTarget);
  }
}
