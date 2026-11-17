# Contorno 3D para textos (3MF)

Crea una base delgada que sigue el contorno de las letras (texto en un color, base en otro) para pegar frases sobre fotos.

- `index.html`: página web. Dos modos: **Escribir texto** (una frase por línea, tipografía y colores a elección) o **Subir un 3MF** que ya tenga el texto. Entrega un .3mf con base + letras. Funciona sin servidor ni instalación.
- `base_contorno.py` + `hacer_contorno.bat`: lo mismo en el computador (Windows). Se arrastra el .3mf sobre el .bat. Necesita Python (instala numpy, scipy, pillow y contourpy la primera vez).

Valores por defecto: margen 1,0 mm, cierre 2,6 mm, base 0,6 mm, relieve 1,6 mm, filamento 1 base / 2 letras.

Los colores elegidos se escriben en la lista de filamentos del proyecto (filamento de la base y de las letras). El modo de escribir texto usa el perfil de impresora del archivo de ejemplo (Anycubic Kobra X 0.4); si usas otra impresora, abre el .3mf en el slicer y cambia el perfil. Tipografías de Google: necesitan internet. Freestyle Script solo sale si está instalada en el computador.
