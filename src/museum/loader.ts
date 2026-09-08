import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

// Hall loader: overlay with real byte-based progress.
// Draco decoding is not measurable, so the 90→100 stretch is eased by hand.

const draco = new DRACOLoader().setDecoderPath("/draco/");
const gltf = new GLTFLoader().setDRACOLoader(draco);

const overlay = document.getElementById("loader") as HTMLElement;
const hallLabel = document.getElementById("loaderHall") as HTMLElement;
const pctLabel = document.getElementById("loaderPct") as HTMLElement;
const bar = document.getElementById("loaderBar") as HTMLElement;

function setProgress(pct: number) {
  const value = Math.min(100, Math.round(pct));
  pctLabel.textContent = String(value);
  bar.style.width = `${value}%`;
}

export async function loadWithProgress(url: string, hall: string): Promise<GLTF> {
  hallLabel.textContent = hall;
  setProgress(0);
  overlay.hidden = false;
  overlay.classList.remove("leaving");
  const start = performance.now();

  const model = await new Promise<GLTF>((resolve, reject) => {
    gltf.load(
      url,
      resolve,
      (e) => { if (e.total) setProgress((e.loaded / e.total) * 90); },
      reject,
    );
  });

  // Smooth finish to 100 plus a minimum display time so it never flickers.
  const remaining = Math.max(0, 900 - (performance.now() - start));
  await new Promise((r) => setTimeout(r, remaining));
  setProgress(100);
  await new Promise((r) => setTimeout(r, 250));
  overlay.classList.add("leaving");
  setTimeout(() => (overlay.hidden = true), 500);

  return model;
}
