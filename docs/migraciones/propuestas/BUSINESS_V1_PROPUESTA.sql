-- KultiApp Business V1 · PROPUESTA de esquema. NO APLICADA EN PRODUCCIÓN.
-- Probada solo en una base PostgreSQL 16 local y desechable (ver docs/KULTIAPP_BUSINESS_V1_QA.md).
-- Todo es aditivo: no borra ni modifica datos existentes. Retroceso: BUSINESS_V1_ROLLBACK.sql.
-- Clave de negocio: workspace_id (ya está en todas las tablas y en todas las políticas); no se agrega business_id.
-- El cliente actual NO usa nada de esto: los pedidos siguen leyéndose de production_orders hasta la fase C.

-- ========== FASE A · ESQUEMA ADITIVO ==========

-- A0. Rendimiento: auth.uid() se evalúa una vez por consulta y no por fila (aviso del linter de Supabase).
drop policy if exists brand_assets_insert on public.brand_assets;
create policy brand_assets_insert on public.brand_assets for insert to authenticated
  with check (private.can_edit_workspace(workspace_id) and created_by = (select auth.uid()));

-- A1. Seguridad: el rol de la API no necesita TRUNCATE, TRIGGER ni REFERENCES en ninguna tabla.
-- (PostgREST no expone TRUNCATE, pero sobran permisos heredados de las primeras versiones.)
revoke truncate, trigger, references on
  public.cost_items, public.print_jobs, public.products, public.workspace_invites,
  public.workspace_members, public.workspace_settings, public.workspaces
  from authenticated;

-- A2. Productos: SKU, categorías, tiempo de fabricación y modalidad.
alter table public.products
  add column if not exists sku text check (sku is null or length(trim(sku)) between 1 and 60),
  add column if not exists category text check (category is null or length(trim(category)) between 1 and 80),
  add column if not exists subcategory text check (subcategory is null or length(trim(subcategory)) between 1 and 80),
  add column if not exists lead_time_minutes integer check (lead_time_minutes is null or lead_time_minutes >= 0),
  add column if not exists fulfillment text not null default 'both' check (fulfillment in ('stock', 'make_to_order', 'both'));
create unique index if not exists products_sku_unique on public.products (workspace_id, lower(sku)) where sku is not null;
create index if not exists products_category on public.products (workspace_id, category);

-- A3. Variantes por tamaño, color y presentación. El stock de una variante solo cambia por funciones (fase C).
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  sku text check (sku is null or length(trim(sku)) between 1 and 60),
  size text check (length(size) <= 60),
  color text check (length(color) <= 60),
  presentation text check (length(presentation) <= 60),
  sale_price numeric check (sale_price is null or sale_price >= 0),
  unit_cost numeric check (unit_cost is null or unit_cost >= 0),
  stock_qty numeric not null default 0 check (stock_qty >= 0),
  stock_reserved numeric not null default 0 check (stock_reserved >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_variants_product on public.product_variants (product_id);
create unique index if not exists product_variants_sku_unique on public.product_variants (workspace_id, lower(sku)) where sku is not null;

-- A4. Líneas de pedido: un pedido puede tener varios productos y mezclar stock con fabricación.
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.production_orders(id) on delete cascade,
  position integer not null default 1 check (position >= 1),
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  quantity integer not null check (quantity >= 1),
  unit_price numeric not null check (unit_price >= 0),
  discount numeric not null default 0 check (discount >= 0),
  iva_enabled boolean not null default false,
  iva_rate numeric not null default 0.19 check (iva_rate >= 0 and iva_rate <= 1),
  -- Costo estimado por unidad al crear el pedido: cambiar precios después no lo altera.
  unit_cost_snapshot numeric not null default 0 check (unit_cost_snapshot >= 0),
  fulfillment text not null default 'make' check (fulfillment in ('stock', 'make')),
  notes text not null default '' check (length(notes) <= 500),
  created_at timestamptz not null default now(),
  unique (order_id, position),
  check (discount <= quantity * unit_price)
);
create index if not exists order_items_order on public.order_items (order_id);
create index if not exists order_items_workspace on public.order_items (workspace_id);

-- A5. Estados independientes: la entrega deja de compartir columna con el estado general.
alter table public.production_orders
  add column if not exists discount numeric not null default 0 check (discount >= 0),
  add column if not exists delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'shipped', 'delivered', 'returned'));

-- A6. Órdenes de fabricación (pedido o reposición de stock) y sus materiales.
create table if not exists public.manufacturing_orders (
  id uuid primary key default gen_random_uuid(),
  mo_no integer generated always as identity,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null default 'order' check (kind in ('order', 'restock')),
  order_id uuid references public.production_orders(id) on delete set null,
  order_item_id uuid references public.order_items(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  planned_qty integer not null check (planned_qty >= 1),
  produced_qty integer not null default 0 check (produced_qty >= 0),
  printer_id uuid references public.workspace_resources(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'scheduled', 'making', 'quality', 'done', 'paused', 'canceled', 'failed')),
  quality_result text not null default 'pending' check (quality_result in ('pending', 'passed', 'failed')),
  estimated_minutes numeric not null default 0 check (estimated_minutes >= 0),
  actual_minutes numeric check (actual_minutes is null or actual_minutes >= 0),
  estimated_grams numeric not null default 0 check (estimated_grams >= 0),
  actual_grams numeric check (actual_grams is null or actual_grams >= 0),
  estimated_cost numeric not null default 0 check (estimated_cost >= 0),
  actual_cost numeric check (actual_cost is null or actual_cost >= 0),
  failures_cost numeric not null default 0 check (failures_cost >= 0),
  notes text not null default '' check (length(notes) <= 1000),
  -- Un reintento con la misma clave no duplica el consumo ni el ingreso de productos terminados.
  request_key text check (request_key is null or length(request_key) between 8 and 80),
  completed_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'order' or order_id is not null),
  check (status <> 'done' or (quality_result = 'passed' and produced_qty >= 1))
);
create unique index if not exists manufacturing_orders_request_key
  on public.manufacturing_orders (workspace_id, request_key) where request_key is not null;
create index if not exists manufacturing_orders_workspace_status on public.manufacturing_orders (workspace_id, status);
create index if not exists manufacturing_orders_order on public.manufacturing_orders (order_id);

create table if not exists public.manufacturing_materials (
  manufacturing_order_id uuid not null references public.manufacturing_orders(id) on delete cascade,
  resource_id uuid not null references public.workspace_resources(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  planned_qty numeric not null check (planned_qty >= 0),
  consumed_qty numeric not null default 0 check (consumed_qty >= 0),
  unit_cost numeric not null default 0 check (unit_cost >= 0),
  primary key (manufacturing_order_id, resource_id)
);
create index if not exists manufacturing_materials_workspace on public.manufacturing_materials (workspace_id);

-- A7. RLS: lectura para miembros, escritura para propietarios y editores, igual que el resto.
alter table public.product_variants enable row level security;
alter table public.order_items enable row level security;
alter table public.manufacturing_orders enable row level security;
alter table public.manufacturing_materials enable row level security;
revoke all on public.product_variants, public.order_items, public.manufacturing_orders, public.manufacturing_materials from anon, authenticated;

grant select, delete on public.product_variants, public.order_items, public.manufacturing_orders, public.manufacturing_materials to authenticated;
-- Variantes: sin escritura directa del stock.
grant insert (workspace_id, product_id, name, sku, size, color, presentation, sale_price, unit_cost, active) on public.product_variants to authenticated;
grant update (name, sku, size, color, presentation, sale_price, unit_cost, active, updated_at) on public.product_variants to authenticated;
grant insert (workspace_id, order_id, position, product_id, variant_id, title, quantity, unit_price, discount, iva_enabled, iva_rate, unit_cost_snapshot, fulfillment, notes) on public.order_items to authenticated;
grant update (position, product_id, variant_id, title, quantity, unit_price, discount, iva_enabled, iva_rate, fulfillment, notes) on public.order_items to authenticated;
-- Fabricación: el avance, lo producido y el consumo solo cambian por funciones (fase C) para que sean idempotentes.
grant insert (workspace_id, kind, order_id, order_item_id, product_id, variant_id, planned_qty, printer_id, estimated_minutes, estimated_grams, estimated_cost, notes) on public.manufacturing_orders to authenticated;
grant update (printer_id, planned_qty, estimated_minutes, estimated_grams, estimated_cost, notes, updated_at) on public.manufacturing_orders to authenticated;
grant select on public.manufacturing_materials to authenticated;

do $$
declare t text;
begin
  foreach t in array array['product_variants', 'order_items', 'manufacturing_orders', 'manufacturing_materials'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (private.is_workspace_member(workspace_id))', t);
    execute format('drop policy if exists %1$s_remove on public.%1$s', t);
    execute format('create policy %1$s_remove on public.%1$s for delete to authenticated using (private.can_edit_workspace(workspace_id))', t);
  end loop;
  foreach t in array array['product_variants', 'order_items', 'manufacturing_orders'] loop
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (private.can_edit_workspace(workspace_id))', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (private.can_edit_workspace(workspace_id)) with check (private.can_edit_workspace(workspace_id))', t);
  end loop;
end $$;

-- ========== FASE B · RELLENO DESDE LOS PEDIDOS ACTUALES (idempotente) ==========
-- Ensayar primero con SELECT count(*) y comparar con la tabla de origen.

-- B1. Una línea por pedido existente.
insert into public.order_items
  (workspace_id, order_id, position, product_id, title, quantity, unit_price, iva_enabled, iva_rate, unit_cost_snapshot, fulfillment)
select o.workspace_id, o.id, 1, o.product_id, o.title, o.quantity, o.unit_price, o.iva_enabled, o.iva_rate,
       case when o.quantity > 0 then o.estimated_cost / o.quantity else 0 end,
       case when o.from_stock then 'stock' else 'make' end
from public.production_orders o
where not exists (select 1 from public.order_items i where i.order_id = o.id);

-- B2. Estado de entrega a partir del estado actual.
update public.production_orders
   set delivery_status = case status when 'shipped' then 'shipped' when 'delivered' then 'delivered' else 'pending' end
 where delivery_status = 'pending' and status in ('shipped', 'delivered');

-- B3. Una orden de fabricación por pedido que se fabrica (no las ventas desde stock). Sin consumo: los
-- materiales ya están registrados en inventory_order_lines y no se duplican.
insert into public.manufacturing_orders
  (workspace_id, kind, order_id, order_item_id, product_id, planned_qty, produced_qty, status, quality_result,
   estimated_minutes, estimated_grams, estimated_cost, actual_minutes, actual_grams, actual_cost, failures_cost,
   completed_at, request_key, created_by, created_at)
select o.workspace_id,
       case when o.kind = 'stock' then 'restock' else 'order' end,
       o.id, i.id, o.product_id, o.quantity,
       case when o.status in ('ready', 'shipped', 'delivered') then o.quantity else 0 end,
       case o.status when 'pending' then 'pending' when 'printing' then 'making' when 'assembly' then 'making'
                     when 'canceled' then 'canceled' else 'done' end,
       case when o.status in ('ready', 'shipped', 'delivered') then 'passed' else 'pending' end,
       o.estimated_minutes, o.estimated_grams, o.estimated_cost, o.actual_minutes, o.actual_grams, o.actual_cost, o.failures_cost,
       case when o.status in ('ready', 'shipped', 'delivered') then o.updated_at end,
       'backfill-' || o.id::text,
       w.owner_id,   -- la migración corre sin sesión de usuario: el creador histórico es el propietario del taller
       o.created_at
from public.production_orders o
join public.workspaces w on w.id = o.workspace_id
join public.order_items i on i.order_id = o.id and i.position = 1
where not o.from_stock
  and not exists (select 1 from public.manufacturing_orders m where m.order_id = o.id);
