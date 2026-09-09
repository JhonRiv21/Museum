import manifest from "../../assets/pieces.json";

// The manifest (assets/pieces.json) is the single source of truth: sources,
// licenses, calibration and didactic content live there. This module types it
// and derives what the app needs.

export type PieceInfo = {
  id: string;
  name: string;
  species: string;
  facts: string[];
};

export type Calibration = {
  upAxisFix: number;
  roll: number;
  pitch: number;
  yaw: number;
  size: number;
  yOffset: number;
  offsetX?: number;
  offsetZ?: number;
};

export type ManifestPiece = (typeof manifest.pieces)[number];

export const MANIFEST = manifest;

export function pieceInfo(piece: ManifestPiece): PieceInfo {
  return { id: piece.id, ...piece.display };
}

export function hallName(id: string): string {
  return MANIFEST.halls.find((h) => h.id === id)?.name ?? id;
}

// Gray marker for every pedestal whose real piece has not arrived yet.
export const PLACEHOLDER: PieceInfo = {
  id: "placeholder",
  name: "Próximamente",
  species: "Vitrina en preparación",
  facts: ["Esta pieza llegará en la siguiente fase del museo."],
};

// HUD hall zones by camera depth.
export const HALLS = [
  { name: "Vestíbulo", untilZ: 4 },
  { name: hallName("paleo"), untilZ: -12 },
  { name: hallName("flight"), untilZ: -36 },
  { name: hallName("ocean"), untilZ: -Infinity },
];
