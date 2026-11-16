# KultiApp — El taller bajo control

Aplicación de Kultiverso Pop para gestionar un taller de impresión 3D: costos de productos, cotizaciones,
pedidos y producción, inventario de filamentos e insumos, stock terminado, ventas, cobros, finanzas y
reportes. Funciona en celular y computador, se instala como app y la comparte todo el equipo.

Publicada en https://kultiapp.vercel.app · Powered by ELARA.

## Qué hace

- **Productos**: costeo por impresiones, filamentos e insumos; margen, IVA, redondeo y escenarios de precio;
  fotos; stock terminado; catálogo público y listas de precios rápidos.
- **Cotizaciones**: documento, PDF o imagen para WhatsApp; se convierten en pedido.
- **Pedidos**: ficha con estado, materiales (reserva y consumo), pagos, avisos al cliente, enlace de
  seguimiento, fotos y fallas; revisión contra la receta del producto.
- **Inventario**: ficha de cada material con movimientos, pesaje de rollos, historial y deshacer; modo
  conteo; lista de compras.
- **Clientes**, **Impresoras**, **Reportes**, **Finanzas** (dinero hoy, utilidad real, gastos, IVA, socios),
  **Inicio** con pendientes y **Mi perfil**.
- **Centro de operaciones** en Inicio: ventas, cobros, costo y utilidad por periodo, pedidos y fabricación.
- **Kit de marca**: logos, tarjetas, redes sociales y etiquetas oficiales, con descarga del original.

## Documentación

- [Manual de uso](docs/MANUAL.md)
- [Arquitectura](docs/ARQUITECTURA.md)
- [Base de datos](docs/BASE_DE_DATOS.md)
- [Historial de versiones](docs/HISTORIAL.md) (detalle en `docs/versiones/`, SQL en `docs/migraciones/`)
- [Versiones de consolidación](docs/CONSOLIDACION.md)
- KultiApp Business V1: [auditoría](docs/KULTIAPP_BUSINESS_V1_AUDITORIA.md), [arquitectura](docs/KULTIAPP_BUSINESS_V1_ARQUITECTURA.md), [modelo de datos](docs/KULTIAPP_BUSINESS_V1_MODELO_DATOS.md), [plan](docs/KULTIAPP_BUSINESS_V1_PLAN.md) y [QA](docs/KULTIAPP_BUSINESS_V1_QA.md)

## Desarrollo

Sitio estático sin compilación: `index.html`, `styles.css` y `js/01-core.js` … `js/16-money.js`, scripts
clásicos por tema que comparten el ámbito global (ver Arquitectura). Backend en Supabase (Auth, Postgres con
RLS y Storage).

```sh
npm ci
npm run lint
npm test
bash tests/db/run-local.sh   # esquema propuesto de Business V1 en un PostgreSQL local desechable (opcional)
```

GitHub Actions corre lint y pruebas, CodeQL y gitleaks. Vercel publica `main` en producción y genera una
vista previa por rama. Las migraciones se aplican en Supabase antes de publicar el cliente que las usa.
