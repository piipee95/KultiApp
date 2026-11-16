# KultiApp Business V1 · Auditoría del proyecto

Fecha: 16 de noviembre de 2026 · Punto de partida: `main` en el commit `64dfa6c` (KultiApp 5.2). **Mientras se trabajaba, `main` avanzó a 5.4.0**
(`ffe36f8`: claridad y paleta, galería de productos, estudio del editor, menús anclados y desgaste por hora, con dos cambios de
base de datos aplicados por otras sesiones). Se integró `main` en la rama de trabajo `claude/festive-gates-7xcuy2`, se
resolvieron los conflictos (Inicio, estilos, versión e historial) y se volvió a pasar todo; las tablas y columnas de este
documento se leyeron de la base de producción **ya con 5.4.0 aplicado**. Todo lo de este documento se comprobó en el repositorio, en la base de
datos de Supabase (solo lectura) y ejecutando las pruebas; lo que no se pudo comprobar se dice expresamente.

## 1. Estado real del sistema

| Aspecto | Hallazgo |
|---|---|
| Framework | Ninguno. JavaScript clásico sin compilación: `index.html` + `styles.css` + 15 scripts `js/01…15` y `99-start.js` que comparten el ámbito global. Páginas públicas (`catalogo`, `seguimiento`, `subir`) como módulos ES. Service worker `sw.js`. |
| Tamaño | 20.500 líneas de JS, 5.900 de CSS. Los mayores: `07-inventory` (1.965), `11-customers-quotes` (1.803), `09-orders` (1.614), `14-brand` (1.514), `12-finance-reports` (1.444). |
| Dependencias | Solo de desarrollo: ESLint, `globals` y jsdom. En ejecución solo `@supabase/supabase-js`, desde jsDelivr con versión fija. Sin dependencias para Excel (`zipStore` propio). |
| Hosting | Vercel: `main` publica `kultiapp.vercel.app`; cada rama genera una vista previa. |
| Base de datos | Supabase (Postgres + Auth + Storage). 22 tablas en `public`, todas con RLS; 25 funciones en `private` (con `security definer` y `search_path` vacío) y 20 envoltorios en `public`; 21 triggers; 3 buckets privados. |
| Git | Rama activa al día con `main`, sin cambios sin confirmar. Un PR por versión, fusionados por squash. |
| CI | GitHub Actions ya existentes: `test.yml` (lint + pruebas), CodeQL (semanal y por PR) y gitleaks. Es el plan gratuito; no se agregó ninguno. |
| Versión | 5.4.0 en `main` (5.5 con este trabajo). |

Datos reales (aproximados): 14 productos, 14 recursos de inventario, 7 pedidos, 56 movimientos de inventario,
51 líneas de materiales de pedidos, 58 recursos de marca. Un solo taller con operación real. Existe un segundo
espacio también llamado «Kultiverso Pop», sin datos, cuyo propietario es el socio editor del primero.

## 2. Pruebas y validaciones ejecutadas

| Validación | Resultado |
|---|---|
| `npm run lint` (ESLint) | 0 errores. |
| `npm test` (jsdom con backend simulado) | 41/41 al comenzar sobre 5.2; **46/46** tras integrar 5.4.0 (4 suites nuevas de otras sesiones) y sumar la de este trabajo. |
| Aviso de seguridad de Supabase | 1: protección de contraseñas filtradas desactivada. Es una función del plan pago; la app la cubre del lado del cliente al crear o cambiar contraseñas. |
| Avisos de rendimiento | 1 real y 14 informativos. El real: la política `brand_assets_insert` evalúa `auth.uid()` por fila (se resuelve con `(select auth.uid())`); está en la propuesta SQL, **no aplicado**. Los 14 índices «sin uso» son esperables con tan pocos datos y no se tocan. |
| Compilación | No existe (sitio estático). La carga de cada archivo se comprueba con las pruebas y con capturas en navegador real. |
| Pruebas de extremo a extremo con base real | **No existen para la app.** El cliente se prueba con un simulador; las políticas RLS de producción se verificaron a mano en transacciones revertidas. Para el esquema propuesto sí hay prueba SQL local (`tests/db/run-local.sh`). |

## 3. Funcionalidades verificadas frente a la visión de Business V1

Leyenda: **Sí** = existe y funciona; **Parcial** = existe con límites; **No** = no existe.

| Módulo pedido | Estado | Evidencia y límites |
|---|---|---|
| Dashboard operativo | Parcial → **mejorado en 5.5** | Antes: tarjetas del mes y listas. Ahora: periodo (hoy, semana, mes, año, rango), ventas, cobros, costo y utilidad por separado, variación, gráfico, estado de pedidos, más vendidos y actividad (ver arquitectura). Faltan ventas «de la semana y el año» en simultáneo y comparación entre rangos arbitrarios (el rango libre compara con el tramo anterior de igual largo). |
| Productos y catálogo | Parcial | Crear, editar, duplicar, archivar; foto; precio, costo y margen; stock terminado; catálogo público. **No hay** SKU, categorías, variantes, tiempo de fabricación por producto ni archivos de fabricación ni historial de cambios. |
| Inventario | Sí (materia prima) / Parcial (terminados) | Materiales (filamento e insumos) con movimientos, reservas, mínimo, conteo, historial y deshacer; las funciones de inventario bloquean filas (`for update`) y validan antes de escribir (`inventory_apply_movement`, `inventory_resource_guard`); `inventory_consume` usa `request_key` para no duplicar consumos. **No verificado:** que exista una regla explícita contra el stock negativo con autorización; se comprobará con pruebas SQL antes de apoyarse en ella. Terminados: `stock_qty`/`stock_reserved` por producto y `product_stock_movements`, sin variantes. Resinas y repuestos se pueden registrar como insumos, sin tipo propio. |
| Clientes | Sí | Ficha, historial, cotizaciones, pedidos, saldos, búsqueda. Sin CRM (previsto así). |
| Cotizaciones y pedidos | Parcial | Cotización → pedido con trazabilidad (`quotes.order_id`). **Un pedido tiene un solo producto** (`production_orders` es una fila por producto): no hay pedidos con varios productos ni mixtos, ni descuentos por pedido, ni modalidad por ítem. |
| Estados independientes | Parcial | El pago se calcula aparte (`orderBalance`: sin pago, parcial, pagado), pero fabricación y entrega comparten la columna `status` (pendiente → imprimiendo → armado → listo → enviado → entregado). |
| Fabricación | Parcial | Existe como pedido de tipo `stock` (suma unidades al terminar) y consumo real de materiales; fallas y merma (`print_failures`); horas por impresora y mantención. **No existe** la orden de fabricación como entidad (cantidad planificada vs producida, impresora asignada por orden, control de calidad, pausa). Multicolor: soportado en `print_jobs.filaments`. |
| Costos | Sí | Calculadora por impresiones (filamento, electricidad, desgaste por hora), costos directos y adicionales (incluye mano de obra y armado), IVA, margen **sobre la venta** (`neto = costo/(1−margen)`), redondeo y escenarios. Los pedidos guardan `estimated_cost` y `unit_cost` por línea de material: **cambiar precios no altera pedidos ya hechos**. Falta mostrar «recargo sobre costo» (se agregó en el dashboard). |
| Reportes | Parcial | Reporte mensual (ventas, utilidad, cobros, productos, clientes, costo estimado vs real, 6 meses) y Finanzas (utilidad real, IVA, gastos, socios); exportación a Excel. **Sin CSV**, sin rentabilidad por producto en el tiempo, sin utilización de impresoras como reporte. |
| Multi-negocio | Preparado | Ver sección 6: `workspace_id` ya cumple el papel de `business_id`. |
| Seguridad | Sí | RLS en todo; roles propietario/editor/visor; tokens de 64 hex para páginas públicas; funciones `definer` solo en `private`; sin `service_role` en el cliente. |
| Móvil | Sí | Barra inferior y hoja «Más» bajo 960 px; verificado con capturas a 390 px. |

## 4. Problemas encontrados

1. **El pedido es de un solo producto.** Es el límite estructural más importante: bloquea pedidos mixtos, descuentos
   por pedido y la modalidad stock/fabricación por ítem.
2. **Estado único para fabricación y entrega.** Obliga a elegir entre «armado» o «enviado» aunque la fabricación
   y la entrega avancen por separado.
3. **Fabricación sin entidad propia.** La orden de fabricación no existe; hoy es un pedido de tipo `stock`.
4. **Sin SKU, categorías ni variantes** en productos.
5. **Ventana de datos de 12 meses** en el arranque; lo anterior se pide desde Reportes. El dashboard avisa cuando
   el rango pedido es anterior a lo cargado.
6. **Pruebas sin base real.** La app se prueba con un simulador; los cambios de esquema se validaban con SQL a mano. Se agregó `tests/db/run-local.sh`, que prueba el esquema propuesto en un PostgreSQL local desechable (la app misma sigue sin pruebas contra una base real).
7. **Aviso de rendimiento RLS** en `brand_assets_insert` (propuesto, no aplicado).
8. **Permisos de sobra en la API.** El rol `authenticated` conserva `TRUNCATE`, `TRIGGER` y `REFERENCES` sobre
   8 tablas heredadas (`products`, `cost_items`, `print_jobs`, `workspaces`, `workspace_members`,
   `workspace_settings`, `workspace_invites` y la vista `product_cost_summary`). PostgREST no expone `TRUNCATE`, así que
   no hay una vía de explotación conocida desde la app, pero es privilegio innecesario. Retirarlo está en la propuesta
   SQL (A1) y se probó en una base local; **no se aplicó**. Las tablas posteriores a la 3.x no lo tienen. `anon` no tiene
   permisos sobre ninguna tabla.
9. **Dos espacios con el mismo nombre** (uno vacío): conviene decidir si el segundo se retira; no se tocó.

## 5. Componentes reutilizables

Se reutilizó todo lo que ya calculaba: `orderNumbers` (ventas, neto, costo, utilidad real y estimada),
`orderBalance` y `receivables`, `reportRows` (incluye meses antiguos cargados), `orderIsOpen`/`orderIsLate`,
`reminders`, `stockValuation`, las clases `.kpi`, `.panel`, `.pills`, `.list-row`, `.bar`, la hoja «Más» y el
patrón de páginas por tema. No se duplicó ninguna fórmula de dinero.

## 6. Preparación multiempresa (hallazgo clave)

`workspace_id` **ya es el identificador de negocio**: está en todas las tablas de datos, todas las políticas RLS
dependen de `private.is_workspace_member(workspace_id)` o `private.can_edit_workspace(workspace_id)`, y las rutas de
Storage empiezan por el `workspace_id`. Agregar un `business_id` paralelo duplicaría el concepto y abriría la puerta a
inconsistencias. **Recomendación:** mantener `workspace_id` como clave de negocio y documentar las reglas de
aislamiento (ver `docs/KULTIAPP_BUSINESS_V1_ARQUITECTURA.md`). La especialización en impresión 3D vive en
`print_jobs`, `workspace_resources` de tipo impresora/filamento, `print_failures` y el editor de producto.

## 7. Riesgos técnicos

| Riesgo | Mitigación |
|---|---|
| Migrar `production_orders` a pedidos con ítems rompe pedidos, pagos, inventario, tracking y reportes que leen esa tabla. | Migración aditiva en fases con doble escritura y vistas de compatibilidad (ver plan). No se ejecuta sin aprobación. |
| La vista previa de Vercel de una rama usa **la misma base de producción**. | Nada de esta intervención cambió el esquema; los cambios de esquema quedan como propuesta hasta tener base de pruebas. |
| Scripts globales: un nombre repetido pisa a otro. | ESLint (`no-redeclare`) y las pruebas de carga lo detectan; se mantiene el prefijo por tema (`ops…`). |
| Concurrencia en inventario. | Ya resuelta en funciones SQL (`for update`, `request_key`); toda operación nueva de fabricación debe seguir ese patrón. |

## 8. Plan de implementación

Ver `docs/KULTIAPP_BUSINESS_V1_PLAN.md`. Esta intervención cubre P1 (auditoría), P2 (navegación y dashboard) y deja
preparado, sin aplicar, el modelo de P3/P4.
