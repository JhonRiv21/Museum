# Mediciones de rendimiento

Sonda en `localhost` (`src/museum/probe.ts`), recorrido completo, pixelRatio 2,
lienzo 2796×1604 (4,48 Mpx), servidor `astro dev`. Comparar con
`node scripts/perf-report.mjs perf/<a> perf/<b>`.

**Ruido de fondo:** entre recorridos del mismo estado, un metro de `z` puede
variar hasta ~50 puntos (media 4-6). Solo cuenta lo que se repite en todos los
recorridos de un estado y no aparece en los del otro.

## 01 · línea base (HEAD 22116bd)
2 recorridos. Vestíbulo 42,7% de fotogramas >33 ms (4 esqueletos a la vista,
85-93 draws); Sala I 23,5%; Sala II 3,2%; Sala III 6,0%. Peor fotograma 50 ms.
Los puntos lentos coinciden entre recorridos: coste de escena, no ruido.

## 02 · + Neptuno, − Marco Aurelio
3 recorridos. Efecto real y localizado en la aproximación al Neptuno
(z −40 a −43): 0% → 5-24% en los tres recorridos. Sala III 6,0% → 10,8%.
Sin picos nuevos (peor 34 ms en esa zona): fotogramas que pasan de 60 a 30 fps.
Draws iguales (15) y triángulos casi iguales (551k → 575k): lo que crece es la
superficie en pantalla — una estatua de 1,85 m sobre plataforma frente a una
cabeza de 31 cm — en una escena limitada por relleno de píxeles.
Resto del museo: sin cambios fuera del ruido.

## 03 · Sala III completa (+ Maya y Merit, − Thot, textura del Buda a 1024)
3 recorridos. Maya y Merit: 0% en su zona (z −48 a −52) en los ocho recorridos
de los tres estados — no cuesta nada. Sala III 10,8% → 13,7%, casi todo la zona
del Neptuno. Nuevo y reproducible: fotogramas >50 ms en la entrada (z ≈ 11-12)
en los tres recorridos, casi ausentes antes. Candidato: el calentamiento de HEAD
mira pasillo abajo y no a las piezas, así que tras cada recarga la entrada
dibuja por primera vez cosas sin calentar; con más texturas en memoria cuesta
más. El arreglo (hornear la mirada antes y calentar las poses reales) está en
stash@{0} y es el siguiente paso controlado.
CORRECCIÓN tras el paso 04: no es reproducible. Con 10 recorridos, los >50 ms en
la entrada salen 0-3 por recorrido en cualquier estado (paso 04: 0, 0 y 3). Era
ruido; con tres recorridos parecía patrón.

## 04 · Augusto de Prima Porta en lugar del Buda
3 recorridos (el 1 grabado ANTES de los arreglos de luz y textura; 2 y 3 finales).
Sin cambios fuera del ruido en lo medido: Sala I 21,8-25,5% en todos los estados,
Sala III 13,8-14,7% (paso 03: 13,0-14,3%). La entrada varía 40-53% entre
recorridos del MISMO estado: es la zona más ruidosa del museo.
AVISO: la sonda cortaba en t = 0,95 (z −52,2) en TODOS los recorridos hasta aquí:
el remate y parte de Maya y Merit nunca se midieron. Corregido a t = 0,98
(z −53,8); hay que repetir este paso para medir el final.
Incluye además dos arreglos que salieron al montarlo:
- El remate (pieza más allá del final del riel) ya no compite por parada: su
  profundidad se saturaba en t = 1 y el agrupador se quedaba con una de las dos
  últimas piezas. Con el Augusto, Maya y Merit perdía su parada y la cámara iba
  del relieve al Augusto. Ahora Maya se mira centrada (4-9°) en t 0,924-0,948.
- Sin rellenos cruzados en el pedestal del remate y albedo del yeso en 0,56:
  píxeles quemados 20% → 4%, contraste local 37 → 114.
- Maya y Merit se veía blanco puro: su escaneo usa KHR_materials_pbrSpecularGlossiness,
  que Three.js ignora desde r147, así que la textura nunca se aplicaba. El pipeline
  ahora convierte spec/gloss → metal/rough antes de optimizar. Única pieza afectada
  de las 18. Ahora sí muestrea una textura: coste nuevo, aunque pequeño.
Vaciado KAS65 de la Colección Real del SMK, bajado de su API abierta sin login
(STL → GLB con `scripts/stl-to-glb.mjs`, fuente `smk:` en el pipeline).
400k triángulos, 0,76 MB optimizado — más ligero que el Buda (0,83 MB).
