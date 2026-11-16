# KultiApp Business V1 · Arquitectura

Documento de diseño. Lo marcado **(implementado)** está en el código (5.5); lo marcado **(propuesto)** está
diseñado y, cuando toca la base de datos, probado en un PostgreSQL local, pero **no aplicado** en producción.

## 1. Principios

1. **Evolucionar, no reconstruir.** Se mantiene el sitio estático sin compilación, los scripts por tema y Supabase.
   No se agregan dependencias ni servicios de pago.
2. **El dinero se calcula en un solo lugar.** `orderNumbers`, `orderBalance` y `reportRows` son la única fuente de
   ventas, costos, utilidad y saldos; el dashboard, Reportes, Finanzas y las fichas los reutilizan, y la prueba
   `recorrido-completo` comprueba que las cifras coincidan entre pantallas.
3. **Conceptos separados.** *Venta* (pedido creado, con IVA) ≠ *cobro* (pago recibido) ≠ *costo* (real si existe,
   estimado si no) ≠ *margen* (utilidad / venta neta) ≠ *recargo* (utilidad / costo) ≠ *utilidad* (real o estimada).
4. **Las operaciones delicadas viven en la base de datos**, en funciones `private.*` con bloqueo de filas,
   validación y claves de reintento; el cliente nunca escribe stock, avance de fabricación ni consumos directamente.
5. **Lo histórico no se reescribe.** Los pedidos guardan el costo estimado y los precios de sus materiales en el
   momento; cambiar un precio de filamento no altera pedidos ya hechos.

## 2. Módulos y archivos

| Módulo | Archivo | Estado |
|---|---|---|
| Núcleo, interfaz, navegación, cuenta | `01-core`, `02-ui`, `03-app`, `04-account` | Existente; 5.5 agrega el menú lateral plegable y el icono `panel-left`. |
| Productos y editor de costos | `05-products`, `06-product-editor` | Existente (SKU, categorías y variantes: propuesto). |
| Inventario | `07-inventory` | Existente (materia prima; terminados por producto). |
| Impresoras y fallas | `08-printers` | Existente. |
| Pedidos, cobros, clientes y cotizaciones | `09-orders`, `10-payments`, `11-customers-quotes` | Existente (pedido de varios productos: propuesto). |
| Finanzas y reportes | `12-finance-reports` | Existente (CSV: pendiente). |
| Inicio | `13-home` | Existente; ahora compone el centro de operaciones. |
| Kit de marca | `14-brand` | Existente (5.1). |
| **Centro de operaciones** | `15-operations` | **Implementado (5.5).** |

## 3. Centro de operaciones (implementado)

Función `operationsView()` (HTML) y `bindOperations()` (eventos), llamadas desde `homeView()`.

- **Periodo**: Hoy, Semana (lunes a domingo), Mes, Año y Rango libre, guardado en el dispositivo. `opsRange()` calcula
  el periodo y el tramo anterior **de igual duración transcurrida** (un mes a mitad de camino se compara con los mismos
  días del mes anterior). En un rango libre el tramo anterior es el inmediatamente previo de igual largo.
- **Cifras** (`opsTotals`): ventas, cobros, costo de fabricación, utilidad (real, estimada o mixta, con el desglose),
  margen y recargo. Variación contra el tramo anterior, o «Sin datos» si ese tramo es anterior a los 12 meses cargados.
- **Gráfico**: ventas y cobros por día (hasta 31 días) o por mes; «Hoy» muestra los últimos 7 días. Un día sin
  movimientos no dibuja barra.
- **Pedidos y fabricación**: pendientes, en fabricación, listos para entregar, enviados y atrasados; cada recuadro
  abre la lista de pedidos ya filtrada. Fabricaciones para stock y entregas de hoy.
- **Más vendidos** del periodo y **actividad reciente** (pedidos, pagos y cotizaciones; abre la ficha).
- **Navegación contextual**: cada cifra lleva a Reportes o Finanzas.
- **Lo que se conserva**: saludo y acciones rápidas, pendientes, alertas de stock, valor del inventario, por cobrar y
  próximas entregas.
- Nada se simula: todo sale de `S.orders`, `S.payments` y `S.quotes` (más lo que Reportes haya traído de meses
  anteriores). Con datos vacíos muestra estados vacíos y ceros, no cifras inventadas.

### Menú lateral plegable (implementado)

Botón en la cabecera del menú (escritorio ≥ 960 px): pasa a una columna de íconos de 72 px con los nombres como
descripción emergente y los contadores como insignia. Se recuerda por dispositivo (`kultiapp_side`). En móvil se
mantiene la barra inferior y la hoja «Más».

## 4. Estados independientes (propuesto)

| Estado | Dónde vive | Valores |
|---|---|---|
| Pedido (comercial) | `production_orders.status` (hoy mezcla fabricación y entrega) | pendiente, en curso, cancelado… |
| Pago | derivado de `order_payments` (`orderBalance`) | sin pago, parcial, pagado |
| Fabricación | `manufacturing_orders.status` | pendiente → programada → en fabricación → control de calidad → terminada; pausada, cancelada, fallida |
| Entrega | `production_orders.delivery_status` | pendiente, enviado, entregado, devuelto |

Transición segura: la columna `status` actual **no se toca**; la entrega y la fabricación se agregan al lado y el
cliente las lee antes de dejar de usar `status` para ellas (ver el plan, fases B y C).

## 5. Fabricación (propuesto)

`manufacturing_orders` (una por pedido que se fabrica o por reposición de stock) con `manufacturing_materials`.
El avance, lo producido y el consumo cambian **solo** por funciones `private.*`, a diseñar y probar en la fase C:

- `mo_start`, `mo_pause`, `mo_quality(passed|failed)`, `mo_complete(produced_qty, request_key)`.
- Cada una bloquea la fila (`for update`), valida la transición, usa `request_key` para que un reintento no consuma
  ni ingrese dos veces, y escribe el consumo real en `inventory_movements` y el ingreso en `product_stock_movements`
  dentro de la misma transacción (todo o nada).
- «Terminada» exige control de calidad aprobado y al menos una unidad (restricción en la tabla, ya probada).
- No se descuenta material por crear una cotización ni por crear la orden: se reserva al programar y se consume al
  terminar, como hoy en `inventory_order_trigger`.

## 6. Multiempresa (documentado, no activado)

**`workspace_id` es el identificador de negocio.** Reglas para cuando se habiliten varios negocios:

1. Toda tabla nueva lleva `workspace_id not null` con `references workspaces(id) on delete cascade`.
2. Toda política RLS pasa por `private.is_workspace_member` / `private.can_edit_workspace`; **nunca** se confía en
   un filtro del cliente. Agregar el identificador no aísla nada por sí solo: lo que aísla son las políticas.
3. Las rutas de Storage empiezan por el `workspace_id` y la política usa `private.photo_workspace(name)`.
4. Las funciones `definer` reciben el taller o lo deducen de la fila y comprueban `auth.uid()` antes de actuar.
5. Los enlaces públicos (seguimiento, catálogo, subida) usan un token de 64 hex por pedido o solicitud, no un
   identificador de negocio.
6. Una prueba SQL por tabla nueva comprueba que un usuario de otro taller ve cero filas y no puede escribir
   (ya existe para las tablas propuestas en `tests/db/business-v1-schema.sql`).
7. Pendiente cuando se habilite: invitaciones por negocio, límites por plan y aislamiento de los avisos de errores.

La especialización 3D queda en módulos extensibles (`print_jobs`, impresoras y filamentos en
`workspace_resources`, `print_failures`, el editor de producto). El núcleo comercial (clientes, cotizaciones,
pedidos, pagos, inventario y reportes) no depende de que el producto se imprima.
