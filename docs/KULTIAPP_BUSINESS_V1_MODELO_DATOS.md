# KultiApp Business V1 · Modelo de datos

Estado: **la base de producción no cambió** en esta intervención. Lo siguiente es el modelo propuesto, escrito en
`docs/migraciones/propuestas/BUSINESS_V1_PROPUESTA.sql` (con retroceso en `BUSINESS_V1_ROLLBACK.sql`) y probado en un
PostgreSQL 16 local y desechable con `tests/db/run-local.sh`. Aplicarlo requiere aprobación expresa.

## 1. Modelo actual (resumen)

`workspaces` → `workspace_members` (owner, editor, viewer) · `products` + `print_jobs` + `cost_items` ·
`workspace_resources` (filamentos, insumos, impresoras) + `inventory_movements` + `inventory_order_lines` ·
`production_orders` (un producto por fila; `kind` customer o stock) + `order_payments` · `quotes` · `customers` ·
`expenses`, `partner_transfers`, `print_failures`, `price_lists`, `brand_assets`, `customer_file_requests`/`customer_files`.
Detalle en `docs/BASE_DE_DATOS.md`.

## 2. Modelo propuesto

```
workspaces ─┬─ products ─┬─ product_variants            (nuevo)  stock solo por funciones
            │            └─ sku, category, subcategory, lead_time_minutes, fulfillment   (columnas nuevas)
            ├─ production_orders ─┬─ order_items         (nuevo)  varios productos por pedido, modalidad por línea
            │   + delivery_status, discount            (columnas nuevas)
            │                     └─ manufacturing_orders ─ manufacturing_materials   (nuevos)
            └─ workspace_resources (impresoras y materiales; sin cambios)
```

| Tabla | Para qué | Claves y reglas |
|---|---|---|
| `product_variants` | Tamaño, color y presentación de un producto, con SKU, precio y costo propios | `unique (workspace_id, lower(sku))`; `stock_qty`/`stock_reserved` ≥ 0 y sin escritura directa (grants por columna). |
| `order_items` | Líneas de un pedido: producto, variante, cantidad, precio, descuento, IVA, **costo estimado por unidad fijado** y modalidad (`stock` o `make`) | `unique (order_id, position)`; `discount <= quantity × unit_price`. |
| `manufacturing_orders` | Fabricación de un pedido (`order`) o reposición de stock (`restock`): planificado vs producido, impresora, estimado vs real (minutos, gramos, costo), fallas, control de calidad y estado | `status` con 8 valores; «done» exige calidad aprobada y ≥ 1 unidad; `unique (workspace_id, request_key)` evita duplicar un cierre reintentado. |
| `manufacturing_materials` | Materiales previstos y consumidos por orden, con el costo unitario de ese momento | PK `(manufacturing_order_id, resource_id)`. |
| `production_orders` (+2 columnas) | `delivery_status` (pendiente, enviado, entregado, devuelto) y `discount` | La columna `status` existente no se toca. |
| `products` (+5 columnas) | `sku`, `category`, `subcategory`, `lead_time_minutes`, `fulfillment` (stock, bajo pedido o ambos) | SKU único por taller sin importar mayúsculas. |

Todas llevan `workspace_id`, RLS con las mismas funciones que el resto (lectura miembros; escritura propietarios y
editores) y permisos por columna. Lo que **no** se puede escribir directamente desde la API: el stock de variantes y el
avance, la cantidad producida, el consumo y el cierre de una orden de fabricación.

## 3. Integridad, concurrencia y reintentos

- **Todo o nada**: cierre, consumo e ingreso a terminados en una sola transacción (funciones `private.*` de la fase C).
- **Sin duplicados**: `request_key` único por taller; repetir el cierre con la misma clave no vuelve a consumir.
- **Sin escrituras parciales**: restricciones `check` en la tabla (ya probadas) y bloqueo `for update` en las funciones.
- **Sin retroactividad**: el costo por unidad queda fijado en `order_items.unit_cost_snapshot` y en
  `manufacturing_materials.unit_cost`.
- **Inventario negativo**: la regla «no se permite salvo autorización» **no está verificada** hoy en la base; se
  comprobará y, si falta, se agrega a las funciones de la fase C con su prueba.

## 4. Relleno de datos existentes (fase B, idempotente)

1. Una línea (`order_items`, posición 1) por pedido existente, con `unit_cost_snapshot = costo estimado / cantidad`.
2. `delivery_status` desde `status` (enviado → enviado, entregado → entregado).
3. Una orden de fabricación por pedido que se fabrica (no por las ventas desde stock): `pending → pending`,
   `printing`/`assembly → making`, `ready`/`shipped`/`delivered → done` con calidad aprobada y producido = cantidad,
   `canceled → canceled`; los pedidos de tipo `stock` pasan a `restock`. No se duplican consumos: los materiales ya
   están en `inventory_order_lines`.
4. Ensayo previo recomendado: `select count(*)` de cada destino contra su origen antes de ejecutar.

Probado con 8 pedidos de ejemplo de todos los estados: 8 líneas, 7 órdenes, mapeo correcto y sin cambios al volver
a ejecutar. Con los datos reales (7 pedidos) el resultado esperado es el mismo patrón, pero **no se ensayó en
producción**.

## 5. Hallazgos de seguridad incluidos en la propuesta

- **A0**: `brand_assets_insert` usa `(select auth.uid())` (aviso de rendimiento del linter).
- **A1**: se retiran `TRUNCATE`, `TRIGGER` y `REFERENCES` al rol de la API en las 7 tablas y 1 vista donde quedaron
  heredados (ver auditoría).

## 6. Compatibilidad y retroceso

Aditivo: no elimina ni reescribe datos y el cliente 5.5 no usa nada de esto. El retroceso borra solo lo agregado
(verificado: tras revertir, pedidos y productos originales quedan intactos).
