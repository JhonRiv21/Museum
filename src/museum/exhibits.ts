import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Rail } from "./rail";
import type { PieceInfo } from "./data";

// Exhibited pieces and the tour state machine:
// rail <-> (animated camera flight) <-> exhibit with free orbit.

export type TourState = "rail" | "flying" | "exhibit";

export type Piece = {
  object: THREE.Object3D;
  center: THREE.Vector3;
  radius: number;
  info: PieceInfo;
};

function easeInOutCubic(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

function tween(durationMs: number, step: (k: number) => void): Promise<void> {
  return new Promise((done) => {
    const start = performance.now();
    const frame = (now: number) => {
      const k = Math.min(1, (now - start) / durationMs);
      step(easeInOutCubic(k));
      if (k < 1) requestAnimationFrame(frame);
      else done();
    };
    requestAnimationFrame(frame);
  });
}

export class Exhibits {
  state: TourState = "rail";
  private pieces: Piece[] = [];
  private hovered: Piece | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private controls: OrbitControls;

  private panel = document.getElementById("panel") as HTMLElement;
  private panelName = document.getElementById("panelName") as HTMLElement;
  private panelSpecies = document.getElementById("panelSpecies") as HTMLElement;
  private panelFacts = document.getElementById("panelFacts") as HTMLElement;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private rail: Rail,
    renderer: THREE.WebGLRenderer,
  ) {
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    // Polar clamp: the camera stays between 13° and 50° of elevation, so it
    // can never dive under the floor or pierce the ceiling (hall is 5.2 high).
    this.controls.minPolarAngle = 0.7;
    this.controls.maxPolarAngle = 1.35;

    renderer.domElement.addEventListener("pointermove", (e) => {
      this.pointer.set(
        (e.clientX / innerWidth) * 2 - 1,
        -(e.clientY / innerHeight) * 2 + 1,
      );
    });
    renderer.domElement.addEventListener("click", () => {
      if (this.state === "rail" && this.hovered) void this.enter(this.hovered);
    });
    (document.getElementById("panelClose") as HTMLElement).onclick = () => void this.exit();
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.state === "exhibit") void this.exit();
    });
  }

  register(object: THREE.Object3D, info: PieceInfo) {
    const bounds = new THREE.Box3().setFromObject(object, true);
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = bounds.getSize(new THREE.Vector3()).length() / 2;
    this.pieces.push({ object, center, radius, info });
  }

  piece(id: string): Piece | undefined {
    return this.pieces.find((p) => p.info.id === id);
  }

  centers(): THREE.Vector3[] {
    return this.pieces.map((p) => p.center);
  }

  private highlight(piece: Piece | null) {
    if (this.hovered === piece) return;
    for (const p of [this.hovered, piece]) {
      if (!p) continue;
      const active = p === piece;
      p.object.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
          o.material.emissive.setHex(active ? 0x3a2c14 : 0x000000);
        }
      });
    }
    this.hovered = piece;
    document.body.style.cursor = piece ? "pointer" : "";
  }

  private async flyTo(position: THREE.Vector3, lookTarget: THREE.Vector3, ms: number) {
    this.state = "flying";
    this.rail.setActive(false);
    this.controls.enabled = false;

    const fromPosition = this.camera.position.clone();
    const fromRotation = this.camera.quaternion.clone();
    const probe = this.camera.clone();
    probe.position.copy(position);
    probe.lookAt(lookTarget);
    const toRotation = probe.quaternion.clone();

    await tween(ms, (k) => {
      this.camera.position.lerpVectors(fromPosition, position, k);
      this.camera.quaternion.slerpQuaternions(fromRotation, toRotation, k);
    });
  }

  async enter(piece: Piece) {
    this.highlight(null);

    // Orbit anchor: horizontal direction from the piece toward the camera.
    // Max distance capped in absolute terms so big pieces cannot push the
    // camera through the hall walls.
    const maxDistance = Math.min(piece.radius * 4, 4.8);
    const distance = Math.min(piece.radius * 2.4, maxDistance * 0.95);
    const direction = this.camera.position.clone().sub(piece.center);
    direction.y = 0;
    if (direction.lengthSq() < 0.01) direction.set(0, 0, 1);
    direction.normalize();
    const target = piece.center.clone()
      .addScaledVector(direction, distance)
      .setY(piece.center.y + piece.radius * 0.55);

    await this.flyTo(target, piece.center, 1100);

    this.controls.target.copy(piece.center);
    this.controls.minDistance = piece.radius * 1.2;
    this.controls.maxDistance = maxDistance;
    this.controls.enabled = true;
    this.state = "exhibit";

    this.panelSpecies.textContent = piece.info.species;
    this.panelName.textContent = piece.info.name;
    this.panelFacts.innerHTML = piece.info.facts.map((f) => `<li>${f}</li>`).join("");
    this.panel.classList.remove("closing", "open");
    this.panel.hidden = false;
    void this.panel.offsetWidth; // restart the pick-up animation
    this.panel.classList.add("open");
  }

  // Zoom for the on-screen buttons: scales the camera-to-target distance
  // within the same limits OrbitControls enforces for the wheel.
  zoom(factor: number) {
    if (this.state !== "exhibit") return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const length = THREE.MathUtils.clamp(
      offset.length() * factor,
      this.controls.minDistance,
      this.controls.maxDistance,
    );
    offset.setLength(length);
    this.camera.position.copy(this.controls.target).add(offset);
  }

  async exit() {
    // The label is put back down while the camera flies out.
    this.panel.classList.remove("open");
    this.panel.classList.add("closing");
    setTimeout(() => {
      this.panel.hidden = true;
      this.panel.classList.remove("closing");
    }, 300);

    const { position, lookTarget } = this.rail.poseAt(this.rail.t);
    await this.flyTo(position, lookTarget, 900);
    this.state = "rail";
    this.rail.setActive(true);
  }

  update() {
    if (this.state === "exhibit") {
      this.controls.update();
      return;
    }
    if (this.state !== "rail") return;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const objects = this.pieces.map((p) => p.object);
    const hits = this.raycaster.intersectObjects(objects, true);
    if (!hits.length) {
      this.highlight(null);
      return;
    }
    const hit = hits[0].object;
    const piece = this.pieces.find((p) => {
      let found = false;
      p.object.traverse((o) => { if (o === hit) found = true; });
      return found;
    });
    this.highlight(piece && piece.center.distanceTo(this.camera.position) < 14 ? piece : null);
  }
}
