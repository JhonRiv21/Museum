import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

// Hall loader: one overlay pass per hall, with progress aggregated by real
// bytes across every file. Draco decoding is not measurable, so the last
// stretch to 100 is eased by hand.

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

export type HallFile = { url: string; bytes: number };

export async function loadHall(
  hall: string,
  files: HallFile[],
  onLoaded: (model: GLTF, index: number) => void,
): Promise<void> {
  hallLabel.textContent = hall;
  setProgress(0);
  overlay.hidden = false;
  overlay.classList.remove("leaving");
  const start = performance.now();

  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  let doneBytes = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const model = await new Promise<GLTF>((resolve, reject) => {
      gltf.load(
        file.url,
        resolve,
        (e) => setProgress(((doneBytes + Math.min(e.loaded, file.bytes)) / totalBytes) * 90),
        reject,
      );
    });
    doneBytes += file.bytes;
    onLoaded(model, i);
  }

  // Smooth finish plus a minimum display time so it never flickers.
  const remaining = Math.max(0, 900 - (performance.now() - start));
  await new Promise((r) => setTimeout(r, remaining));
  setProgress(100);
  await new Promise((r) => setTimeout(r, 250));
  overlay.classList.add("leaving");
  setTimeout(() => (overlay.hidden = true), 500);
}
