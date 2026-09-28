import manifest from "../../assets/pieces.json";
import { lang, t, type Localized } from "./i18n";

// The manifest (assets/pieces.json) is the single source of truth: sources,
// licenses, calibration and didactic content live there. This module types it
// and derives what the app needs.

export type PieceText = {
  name: string;
  species: string;
  facts: string[];
};

export type PieceInfo = {
  id: string;
  text: Localized<PieceText>;
  labelTop: boolean;
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
  const { es, en } = piece.display;
  return { id: piece.id, text: { es, en }, labelTop: "labelTop" in piece.display };
}

export function pieceNames(piece: ManifestPiece): Localized<string> {
  return { es: piece.display.es.name, en: piece.display.en.name };
}

export function hallNames(id: string): Localized<string> {
  return MANIFEST.halls.find((h) => h.id === id)?.name ?? { es: id, en: id };
}

export const hallName = (id: string) => hallNames(id)[lang()];

// HUD hall zones by camera depth.
export const HALLS = [
  { name: () => t("lobby"), untilZ: 4 },
  { name: () => hallName("paleo"), untilZ: -17.5 },
  { name: () => hallName("flight"), untilZ: -36 },
  { name: () => hallName("ancient"), untilZ: -Infinity },
];
