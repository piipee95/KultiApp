# KultiApp Business V1 · QA

Registro de lo verificado en esta intervención (5.3), separando lo **verificado**, lo **verificado solo en local** y lo
**no verificado**. Fecha: 16 de noviembre de 2026.

## 1. Verificado

| Prueba | Cómo | Resultado |
|---|---|---|
| Lint | `npm run lint` | 0 errores. |
| Suites de la app | `npm test` (jsdom, backend simulado) | **42/42**: las 41 previas (3 se actualizaron porque `monthTotals` pasó a `opsTotals`, y una porque «Ventas» se movió de `.kpis` a `.ops-kpis`) + `inicio-centro-de-operaciones`. |
| Cifras entre pantallas | `recorrido-completo` | Ventas, utilidad real y por cobrar siguen coincidiendo en Inicio, Reportes, Finanzas, cliente y pedido. |
| Centro de operaciones | `inicio-centro-de-operaciones` | Ver detalle abajo. |
| Carga en navegador real | Capturas con Chromium (Playwright) a 1280 px y 390 px, con menú abierto y plegado | Sin errores de carga; diseño correcto en ambos anchos; corregidos dos detalles visuales (barras vacías y último recuadro). |

### Qué comprueba la suite nueva

- Mes por defecto; ventas = pedidos de clientes del periodo con IVA, sin cancelados ni fabricación para stock.
- **Cobros** distintos de **ventas** (pagos por fecha de pago).
- Costo real (con fallas) donde existe y estimado donde no; utilidad real + estimada con su desglose.
- Margen sobre la venta neta y recargo sobre el costo, calculados por separado.
- Variación contra el mismo tramo del mes anterior (+190 % en el ejemplo) y «Sin datos / sin base» cuando no hay con qué comparar.
- Estado de pedidos: un pedido **enviado** cuenta como en curso pero nunca atrasado; recuadros que filtran la lista.
- Gráfico: una columna por día del mes, 7 en «Hoy» y en «Semana», 12 en «Año»; los días sin movimiento no dibujan barra.
- Más vendidos (sin cancelados ni stock) y actividad reciente (abre la ficha).
- Periodo y rango personalizado: se guardan, el tramo anterior tiene igual duración y termina el día previo.
- Periodo vacío: estados vacíos y ceros, sin cifras inventadas.
- Menú lateral: plegar, recordar, accesibilidad (`aria-expanded`, `aria-label`, nombres como `title`).

## 2. Verificado solo en local

`bash tests/db/run-local.sh` crea un PostgreSQL 16 desechable con tablas de apoyo que imitan a las de producción y
comprueba `BUSINESS_V1_PROPUESTA.sql` y `BUSINESS_V1_ROLLBACK.sql`: resultado **«TODO OK»**.

- Se puede aplicar dos veces sin duplicar nada (idempotente).
- Relleno: 8 pedidos de ejemplo de todos los estados → 8 líneas y 7 órdenes de fabricación, con el mapeo de estados
  esperado y el propietario como creador histórico.
- Restricciones: no se puede cerrar una orden sin calidad aprobada, ni crear una de pedido sin pedido, ni repetir una
  clave de reintento, ni dar un descuento mayor al total, ni repetir una posición o un SKU (sin importar mayúsculas).
- Permisos: el visor lee y no escribe ni borra; el editor agrega líneas y ajusta notas e impresora, pero **no** cambia el
  avance, lo producido ni el stock de una variante; otro taller ve cero filas y no puede escribir; `TRUNCATE` retirado.
- Retroceso: desaparecen las tablas y columnas nuevas y los pedidos y productos originales quedan intactos.
- La prueba encontró un error real en la propuesta (el relleno no tenía creador); ya está corregido.

Limitación: las tablas de apoyo son simplificadas. No prueba el dialecto exacto de Supabase (por ejemplo, los permisos
por defecto de Storage ni las extensiones).

## 3. No verificado

- **Producción**: no se aplicó nada ni se ensayó el relleno con los datos reales.
- **Sesión real**: no se inició sesión en la app para recorrer el dashboard con datos reales de Kultiverso Pop.
- **Funciones de fabricación y el pedido de varios productos**: no existen todavía.
- **Regla contra el stock negativo**: se vio que las funciones de inventario validan y bloquean filas, pero no se
  comprobó una regla explícita; falta su prueba.
- **Accesibilidad**: solo lo básico (etiquetas, contraste de los temas existentes, foco visible); sin lector de pantalla.
- **Rendimiento con volumen**: el dashboard recorre pedidos y pagos en memoria (12 meses); con miles de pedidos habría
  que medirlo.

## 4. Cómo repetirlo

```sh
npm ci && npm run lint && npm test          # app: 42 suites
bash tests/db/run-local.sh                  # esquema propuesto en PostgreSQL local
```
