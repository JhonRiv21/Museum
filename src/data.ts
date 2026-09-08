// Piece metadata for the prototype. In F2 this becomes the real manifest
// (source, license, calibrated transform, hotspots).

export type PieceInfo = {
  id: string;
  name: string;
  species: string;
  facts: string[];
};

export const PIECES: Record<string, PieceInfo> = {
  triceratops: {
    id: "triceratops",
    name: "Hatcher",
    species: "Triceratops horridus · Marsh, 1889",
    facts: [
      "<strong>Cretácico tardío</strong> — vivió hace unos 68-66 millones de años.",
      "Este ejemplar del Smithsonian fue <strong>el primer esqueleto de dinosaurio digitalizado en 3D</strong> de la historia.",
      "El volante óseo y los tres cuernos le daban defensa y regulación térmica.",
      "Escaneo real del NMNH · dominio público (CC0).",
    ],
  },
  placeholder1: {
    id: "placeholder1",
    name: "Pieza de prueba A",
    species: "Marcador gris · prototipo",
    facts: ["En la versión final aquí irá la garra de <strong>Allosaurus fragilis</strong>."],
  },
  placeholder2: {
    id: "placeholder2",
    name: "Pieza de prueba B",
    species: "Marcador gris · prototipo",
    facts: ["En la versión final aquí irá la muela de <strong>mamut lanudo</strong>."],
  },
  placeholder3: {
    id: "placeholder3",
    name: "Pieza de prueba C",
    species: "Marcador gris · prototipo",
    facts: ["Sala II: aquí irá el <strong>módulo de mando del Apollo 11</strong>."],
  },
  placeholder4: {
    id: "placeholder4",
    name: "Pieza de prueba D",
    species: "Marcador gris · prototipo",
    facts: ["Sala II: aquí irá el <strong>Wright Flyer de 1903</strong>."],
  },
  placeholder5: {
    id: "placeholder5",
    name: "Pieza de prueba E",
    species: "Marcador gris · prototipo",
    facts: ["Sala III: el regreso de los mamíferos al mar, fase 1."],
  },
  placeholder6: {
    id: "placeholder6",
    name: "Pieza de prueba F",
    species: "Marcador gris · prototipo",
    facts: ["Sala III: el regreso de los mamíferos al mar, fase 2."],
  },
};

export const HALLS = [
  { name: "Vestíbulo", untilZ: 4 },
  { name: "Sala I · Paleontología", untilZ: -12 },
  { name: "Sala II · Vuelo y espacio", untilZ: -36 },
  { name: "Sala III · El regreso al mar", untilZ: -Infinity },
];
