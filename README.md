# Museum

[English](#english) · [Español](#español)

**Live:** [museum.riverogz.com](https://museum.riverogz.com)

---

## English

A 3D virtual museum in the browser. Scroll moves you along a guided rail through three halls; click any piece to fly up to it, orbit around it and read its label.

Every exhibit is a scan of a real object — fossils from the Smithsonian, the Apollo 11 command module, the Wright Flyer, statues from the Louvre and ancient Egypt — pulled from open museum collections, optimized for the web and placed in the halls.

### Halls

| Hall | Theme | Pieces |
|------|-------|--------|
| I | Paleontology | Triceratops, T. rex, Stegosaurus, Utahraptor, Allosaurus claw, mammoth molar, Diplocaulus |
| II | Flight and space | Wright Flyer, Apollo 11 *Columbia* and hatch, Cher Ami |
| III | Ancient civilizations | Ramesses III, Maya and Merit, Assyrian protective spirit, Neptune, Mercury on Pegasus, Augustus of Prima Porta |

### How it works

- **Static site.** Astro renders a single page; Three.js does everything else in the browser. No backend, no database, no cookies.
- **Guided rail.** The camera follows a spline. Near each piece it slows down and turns toward it; the windows are measured in metres, so the pacing does not depend on hall length.
- **Constant 30 fps.** The render loop is capped at 30 fps, snapped to whole display refreshes. A steady 30 looks smoother than a frame rate that alternates between 60 and 30, and it runs the same on laptops, phones and weak GPUs.
- **Bilingual.** A Spanish / English switch in the top bar changes every text in place — interface, labels, hall signs and nameplates — mid-tour. The choice is remembered in the browser.
- **Asset pipeline.** `assets/pieces.json` is the single source of truth: source, license, calibration and label text of every piece. `npm run assets` downloads the originals, optimizes them with `gltf-transform` (Draco geometry, WebP textures, simplification) and fails if a hall exceeds its weight budget. The whole museum ships in about 21 MB.

### Stack

Astro 7 · Three.js 0.185 · TypeScript (strict) · gltf-transform · Cloudflare

### Running locally

Requires Node 22.12 or later.

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
npm run typecheck
```

The optimized models are committed in `public/models/`, so the site runs without rebuilding them. `npm run assets` is only needed to add or re-process a piece; the Sketchfab downloads need a `SKETCHFAB_TOKEN` in a local, untracked `.env`.

On `localhost` a performance probe appears (frame times along the route, JSON export). It is never loaded in production.

### Credits and licenses

Scans come from the Smithsonian Open Access program, the SMK (Statens Museum for Kunst), the Rijksmuseum van Oudheden, the Cleveland Museum of Art and Sketchfab authors, under **CC0** or **CC BY 4.0**. Each piece's label in the museum names its author, links the original model and its license, and notes that the model was simplified for the web. The full list lives in `assets/pieces.json`.

### License

The source code is released under the [MIT License](LICENSE): you may reuse it as long as you keep the copyright notice with the author's name.

The 3D models are **not** covered by that license. They belong to their original authors and institutions and keep their own licenses (CC0 or CC BY 4.0). Anyone reusing a CC BY model must credit its author, link the license and state that it was modified; those attributions must be kept in any copy of this project.

### Author

Developed by **Jhon Rivero** — [GitHub](https://github.com/JhonRiv21) · [Portfolio](https://jhon.riverogz.com/)

---

## Español

Un museo virtual en 3D en el navegador. El scroll te lleva por un riel guiado a través de tres salas; con un clic en cualquier pieza la cámara vuela hacia ella, puedes girar a su alrededor y leer su ficha.

Cada pieza es el escaneo de un objeto real — fósiles del Smithsonian, el módulo de mando del Apollo 11, el Wright Flyer, estatuas del Louvre y del antiguo Egipto —, tomado de colecciones abiertas de museos, optimizado para la web y ubicado en las salas.

### Salas

| Sala | Tema | Piezas |
|------|------|--------|
| I | Paleontología | Triceratops, T. rex, Stegosaurus, Utahraptor, garra de Allosaurus, muela de mamut, Diplocaulus |
| II | Vuelo y espacio | Wright Flyer, *Columbia* del Apollo 11 y su escotilla, Cher Ami |
| III | Civilizaciones antiguas | Ramsés III, Maya y Merit, espíritu protector asirio, Neptuno, Mercurio sobre Pegaso, Augusto de Prima Porta |

### Cómo funciona

- **Sitio estático.** Astro genera una sola página; Three.js hace todo lo demás en el navegador. Sin backend, sin base de datos, sin cookies.
- **Riel guiado.** La cámara sigue una curva. Cerca de cada pieza frena y gira hacia ella; las ventanas se miden en metros, así que el ritmo no depende del largo de la sala.
- **30 fps constantes.** El bucle de render está limitado a 30 fps, ajustado a refrescos completos de pantalla. Unos 30 estables se ven más fluidos que una tasa que alterna entre 60 y 30, y el recorrido se comporta igual en portátiles, celulares y GPUs modestas.
- **Bilingüe.** Un selector español / inglés en la barra superior cambia todo el texto en el momento —interfaz, fichas, letreros de sala y placas— sin salir del recorrido. La elección queda guardada en el navegador.
- **Pipeline de modelos.** `assets/pieces.json` es la única fuente de verdad: origen, licencia, calibración y texto de la ficha de cada pieza. `npm run assets` descarga los originales, los optimiza con `gltf-transform` (geometría Draco, texturas WebP, simplificación) y falla si una sala supera su presupuesto de peso. El museo completo pesa unos 21 MB.

### Stack

Astro 7 · Three.js 0.185 · TypeScript (strict) · gltf-transform · Cloudflare

### Ejecutar en local

Requiere Node 22.12 o superior.

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # salida estática en dist/
npm run typecheck
```

Los modelos optimizados están versionados en `public/models/`, así que el sitio corre sin regenerarlos. `npm run assets` solo hace falta para agregar o reprocesar una pieza; las descargas de Sketchfab necesitan un `SKETCHFAB_TOKEN` en un `.env` local, fuera de git.

En `localhost` aparece una sonda de rendimiento (tiempos de fotograma a lo largo del recorrido, exportable en JSON). Nunca se carga en producción.

### Créditos y licencias

Los escaneos vienen del programa Open Access del Smithsonian, el SMK (Statens Museum for Kunst), el Rijksmuseum van Oudheden, el Museo de Arte de Cleveland y autores de Sketchfab, bajo **CC0** o **CC BY 4.0**. La ficha de cada pieza en el museo nombra a su autor, enlaza el modelo original y su licencia, e indica que el modelo se simplificó para la web. La lista completa está en `assets/pieces.json`.

### Licencia

El código fuente se publica bajo la [licencia MIT](LICENSE): puedes reutilizarlo siempre que conserves el aviso de copyright con el nombre del autor.

Los modelos 3D **no** están cubiertos por esa licencia. Pertenecen a sus autores e instituciones originales y conservan sus propias licencias (CC0 o CC BY 4.0). Quien reutilice un modelo CC BY debe dar crédito a su autor, enlazar la licencia e indicar que fue modificado; esas atribuciones deben mantenerse en cualquier copia de este proyecto.

### Autor

Desarrollado por **Jhon Rivero** — [GitHub](https://github.com/JhonRiv21) · [Portafolio](https://jhon.riverogz.com/)
