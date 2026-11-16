# KultiApp Business V1 · Plan de implementación

Prioridades de la primera intervención y estado real. **Implementado** = en el código y probado; **Preparado** = escrito
y probado en entorno local, sin aplicar; **Pendiente** = sin hacer.

## Primera intervención (5.5)

| Prioridad | Entregable | Estado |
|---|---|---|
| P1 Auditoría y preservación | `KULTIAPP_BUSINESS_V1_AUDITORIA.md`; 41 suites previas y lint verificados antes de tocar código; `main` (5.4.0) integrado y reverificado al final | **Implementado** |
| P2 Estructura y experiencia | Centro de operaciones en Inicio (periodo, ventas / cobros / costo / utilidad, variación, gráfico, estado de pedidos, más vendidos, actividad) | **Implementado** |
| P2 Estructura y experiencia | Menú lateral plegable en escritorio | **Implementado** |
| P2 Estructura y experiencia | Reorganizar toda la navegación en módulos | Pendiente (el menú actual de 11 secciones ya es consistente; se propone agruparlo en la fase 2) |
| P3 Núcleo comercial mínimo | Modelo para SKU, categorías, variantes, pedidos de varios productos y estados independientes | **Preparado** (SQL probado en local) |
| P4 Integración operacional | Órdenes de fabricación, consumo real e ingreso a terminados | **Preparado** (tablas); funciones y pantallas **Pendientes** |
| Seguridad | Retirar permisos de sobra; corregir política de `brand_assets` | **Preparado** |

## Bloqueos documentados (no se ejecutaron)

1. **Cambio de esquema en producción.** La vista previa de Vercel de una rama usa la misma base de producción, y hoy no
   hay una base de pruebas del proyecto. Aplicar el esquema propuesto exige tu aprobación, y conviene antes crear una
   rama de base de datos de Supabase (puede tener costo; no se activó).
2. **Pedido de varios productos.** Cambia 09-orders, 10-payments, 12-finance-reports, 13-home, el seguimiento y
   las funciones de inventario. Se hará por fases con doble lectura (ver abajo), no en un solo paso.

## Fases siguientes

**Fase 1 · Base de datos (con aprobación).** Aplicar A0 y A1 (seguridad y rendimiento, bajo riesgo). Luego el esquema
aditivo A2–A7 en una rama de base de datos, ensayar el relleno B con copia de los datos reales y recién entonces
aplicarlo. *Salida*: tablas nuevas vacías o rellenas, cliente sin cambios, 42 suites verdes.

**Fase 2 · Productos y catálogo.** (`save_product_bundle_v5` ya guarda el costo de desgaste por impresión desde 5.4.0; habrá que extenderla para los campos nuevos sin alterar su firma ni permisos.) SKU, categoría, subcategoría, tiempo de fabricación y modalidad en el editor y en
la lista (con búsqueda y orden); variantes con stock por funciones; catálogo público con variantes.

**Fase 3 · Pedidos de varios productos.** El pedido pasa a leer `order_items` (con respaldo en la fila antigua),
descuentos, pedidos mixtos stock + fabricación, ficha y cotización por líneas; `delivery_status` independiente del
estado general. *Riesgo principal*: coherencia de cifras; la prueba `recorrido-completo` se amplía primero.

**Fase 4 · Fabricación.** Funciones `mo_*` (iniciar, pausar, control de calidad, cerrar) idempotentes con prueba SQL
local; pantallas de órdenes (programa por impresora, tiempo real, fallas, control de calidad); consumo real e ingreso
a terminados al cerrar; costo real por orden en la rentabilidad.

**Fase 5 · Reportes.** Exportación CSV, rentabilidad por producto en el tiempo, utilización de impresoras, pérdidas de
producción y consumo de filamento.

**Fase 6 · Experiencia.** Tablas con filtros, orden y búsqueda guardada; paneles laterales de edición; agrupar la
navegación; revisión de accesibilidad con lector de pantalla.

## Qué necesita tu decisión

- Aprobar la **Fase 1** (aplicar la propuesta SQL) y si autorizas crear una rama de base de datos para ensayarla.
- Decidir si el **segundo espacio vacío** «Kultiverso Pop» se conserva.
- Confirmar el orden de las fases 2 a 4 según lo que más te duela hoy.
