# Contorno 3D para textos (3MF)

Crea una base delgada que sigue el contorno de las letras (texto en un color, base en otro) para pegar frases sobre fotos.

- `index.html`: página web. Se suelta el .3mf del texto y entrega un .3mf con base + letras. Funciona sin servidor ni instalación.
- `base_contorno.py` + `hacer_contorno.bat`: lo mismo en el computador (Windows). Se arrastra el .3mf sobre el .bat. Necesita Python (instala numpy, scipy, pillow y contourpy la primera vez).

Valores por defecto: margen 1,0 mm, cierre 2,6 mm, base 0,6 mm, relieve 1,6 mm, filamento 1 base / 2 letras.

Estado: modo "subir 3MF" listo. El modo "escribir texto" está en desarrollo.
