-- Prueba local de docs/migraciones/propuestas/BUSINESS_V1_PROPUESTA.sql y su retroceso.
-- Se ejecuta en una base PostgreSQL desechable con tablas de apoyo que imitan las de producción:
--   psql -v ON_ERROR_STOP=1 -f tests/db/business-v1-schema.sql <base> ; nunca contra Supabase.
\set ON_ERROR_STOP on
drop role if exists authenticated; drop role if exists anon;
create role authenticated nologin; create role anon nologin;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth, private, public to authenticated, anon;
create table public.workspaces (id uuid primary key default gen_random_uuid(), name text, owner_id uuid);
create table public.workspace_members (workspace_id uuid, user_id uuid, role text);
create function private.is_workspace_member(ws uuid) returns boolean language sql stable security definer as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid()) $$;
create function private.can_edit_workspace(ws uuid) returns boolean language sql stable security definer as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid() and m.role in ('owner', 'editor')) $$;
grant execute on all functions in schema private, auth to authenticated;
create table public.products (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, name text, created_at timestamptz default now());
create table public.workspace_resources (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, kind text, name text);
create table public.cost_items (id uuid primary key default gen_random_uuid());
create table public.print_jobs (id uuid primary key default gen_random_uuid());
create table public.workspace_invites (id uuid primary key default gen_random_uuid());
create table public.workspace_settings (workspace_id uuid primary key);
create view public.product_cost_summary as select id from public.products;
create table public.brand_assets (id uuid primary key default gen_random_uuid(), workspace_id uuid not null, created_by uuid not null default auth.uid());
create policy brand_assets_insert on public.brand_assets for insert to authenticated with check (private.can_edit_workspace(workspace_id) and created_by = auth.uid());
alter table public.brand_assets enable row level security;
create table public.production_orders (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, product_id uuid references public.products,
  title text not null, quantity integer not null, unit_price numeric not null, iva_enabled boolean not null default false, iva_rate numeric not null default 0.19,
  estimated_cost numeric not null default 0, estimated_grams numeric not null default 0, estimated_minutes numeric not null default 0,
  actual_cost numeric, actual_grams numeric, actual_minutes numeric, failures_cost numeric not null default 0,
  status text not null, from_stock boolean not null default false, kind text not null default 'customer',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
-- Como en producción, la API empieza con permisos amplios sobre las tablas viejas.
grant all on all tables in schema public to authenticated;

-- Datos: un taller con propietario, editor y visor; otro taller ajeno.
\set w1 '''11111111-1111-1111-1111-111111111111'''
\set w2 '''22222222-2222-2222-2222-222222222222'''
\set owner '''aaaaaaaa-0000-0000-0000-000000000001'''
\set editor '''aaaaaaaa-0000-0000-0000-000000000002'''
\set viewer '''aaaaaaaa-0000-0000-0000-000000000003'''
\set other '''aaaaaaaa-0000-0000-0000-000000000009'''
insert into public.workspaces (id, name, owner_id) values (:w1, 'Kultiverso Pop', :owner), (:w2, 'Otro', :other);
insert into public.workspace_members values (:w1, :owner, 'owner'), (:w1, :editor, 'editor'), (:w1, :viewer, 'viewer'), (:w2, :other, 'owner');
insert into public.products (id, workspace_id, name) values ('b0000000-0000-0000-0000-000000000001', :w1, 'Cuadro'), ('b0000000-0000-0000-0000-000000000002', :w2, 'Ajeno');
insert into public.workspace_resources (id, workspace_id, kind, name) values ('c0000000-0000-0000-0000-000000000001', :w1, 'printer', 'Cobra');
insert into public.production_orders (workspace_id, product_id, title, quantity, unit_price, estimated_cost, status, from_stock, kind, actual_cost) values
 (:w1, 'b0000000-0000-0000-0000-000000000001', 'Pendiente', 2, 10000, 8000, 'pending', false, 'customer', null),
 (:w1, 'b0000000-0000-0000-0000-000000000001', 'Imprimiendo', 1, 10000, 4000, 'printing', false, 'customer', null),
 (:w1, 'b0000000-0000-0000-0000-000000000001', 'Listo', 3, 5000, 6000, 'ready', false, 'customer', 5500),
 (:w1, 'b0000000-0000-0000-0000-000000000001', 'Enviado', 1, 9000, 3000, 'shipped', false, 'customer', 2800),
 (:w1, 'b0000000-0000-0000-0000-000000000001', 'Entregado', 1, 9000, 3000, 'delivered', false, 'customer', 3100),
 (:w1, 'b0000000-0000-0000-0000-000000000001', 'Desde stock', 1, 9000, 3000, 'delivered', true, 'customer', null),
 (:w1, 'b0000000-0000-0000-0000-000000000001', 'Lote', 5, 0, 15000, 'ready', false, 'stock', null),
 (:w1, 'b0000000-0000-0000-0000-000000000001', 'Cancelado', 1, 9000, 3000, 'canceled', false, 'customer', null);

create function pg_temp.fails(stmt text, label text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'DEBÍA FALLAR: %', label;
end $$;
create function pg_temp.eq(got anyelement, want anyelement, label text) returns void language plpgsql as $$
begin if got is distinct from want then raise exception 'FALLÓ %: obtuve %, esperaba %', label, got, want; end if; end $$;

-- 1. Aplicar la propuesta dos veces (debe ser re-ejecutable).
\ir ../../docs/migraciones/propuestas/BUSINESS_V1_PROPUESTA.sql
\ir ../../docs/migraciones/propuestas/BUSINESS_V1_PROPUESTA.sql

-- 2. Relleno: una línea por pedido, una orden de fabricación por pedido que se fabrica, sin duplicar al repetir.
select pg_temp.eq((select count(*) from public.order_items), 8::bigint, 'líneas de pedido');
select pg_temp.eq((select count(*) from public.manufacturing_orders), 7::bigint, 'órdenes de fabricación (todas menos la venta desde stock)');
select pg_temp.eq((select count(*) from public.manufacturing_orders m join public.production_orders o on o.id = m.order_id where o.title = 'Imprimiendo' and m.status = 'making'), 1::bigint, 'imprimiendo → en fabricación');
select pg_temp.eq((select m.status || '/' || m.quality_result || '/' || m.produced_qty from public.manufacturing_orders m join public.production_orders o on o.id = m.order_id where o.title = 'Listo'), 'done/passed/3', 'listo → terminada, aprobada y producida');
select pg_temp.eq((select m.kind from public.manufacturing_orders m join public.production_orders o on o.id = m.order_id where o.title = 'Lote'), 'restock', 'fabricación para stock → reposición');
select pg_temp.eq((select m.status from public.manufacturing_orders m join public.production_orders o on o.id = m.order_id where o.title = 'Cancelado'), 'canceled', 'cancelado');
select pg_temp.eq((select string_agg(title || ':' || delivery_status, ',' order by title) from public.production_orders where delivery_status <> 'pending'), 'Desde stock:delivered,Entregado:delivered,Enviado:shipped', 'estado de entrega');
select pg_temp.eq((select fulfillment from public.order_items i join public.production_orders o on o.id = i.order_id where o.title = 'Desde stock'), 'stock', 'modalidad por línea');
select pg_temp.eq((select unit_cost_snapshot from public.order_items i join public.production_orders o on o.id = i.order_id where o.title = 'Pendiente'), 4000::numeric, 'costo estimado por unidad fijado');
select pg_temp.eq((select count(*) from public.production_orders), 8::bigint, 'los pedidos originales no cambian');
select pg_temp.eq((select count(distinct created_by) from public.manufacturing_orders), 1::bigint, 'creador histórico = propietario');

-- 3. Reglas de datos.
select pg_temp.fails($$insert into public.manufacturing_orders (workspace_id, kind, order_id, planned_qty, status, quality_result, produced_qty) values ('11111111-1111-1111-1111-111111111111', 'order', (select id from public.production_orders limit 1), 1, 'done', 'pending', 1)$$, 'terminada sin control de calidad aprobado');
select pg_temp.fails($$insert into public.manufacturing_orders (workspace_id, kind, planned_qty) values ('11111111-1111-1111-1111-111111111111', 'order', 1)$$, 'orden de pedido sin pedido');
select pg_temp.fails($$insert into public.manufacturing_orders (workspace_id, kind, planned_qty, request_key) select workspace_id, 'restock', 1, 'backfill-' || id from public.production_orders limit 1$$, 'clave de reintento repetida');
select pg_temp.fails($$insert into public.order_items (workspace_id, order_id, position, title, quantity, unit_price, discount) select workspace_id, id, 2, 'x', 1, 100, 500 from public.production_orders limit 1$$, 'descuento mayor al total de la línea');
select pg_temp.fails($$insert into public.order_items (workspace_id, order_id, position, title, quantity, unit_price) select workspace_id, id, 1, 'x', 1, 100 from public.production_orders limit 1$$, 'posición repetida en un pedido');
insert into public.product_variants (workspace_id, product_id, name, sku) values (:w1, 'b0000000-0000-0000-0000-000000000001', 'Grande', 'CUA-G');
select pg_temp.fails($$insert into public.product_variants (workspace_id, product_id, name, sku) values ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000001', 'Otra', 'cua-g')$$, 'SKU repetido sin importar mayúsculas');
select pg_temp.fails($$update public.products set sku = ' ' where id = 'b0000000-0000-0000-0000-000000000001'$$, 'SKU vacío');

-- 4. Permisos: visor solo lee; editor escribe lo permitido; avance y stock solo por funciones; otro taller no ve nada.
set role authenticated;
set test.uid = 'aaaaaaaa-0000-0000-0000-000000000003';
select pg_temp.eq((select count(*) from public.order_items), 8::bigint, 'el visor ve las líneas');
select pg_temp.fails($$insert into public.order_items (workspace_id, order_id, position, title, quantity, unit_price) select workspace_id, id, 9, 'x', 1, 1 from public.production_orders limit 1$$, 'el visor no escribe líneas');
delete from public.manufacturing_orders;   -- RLS no da error: simplemente no encuentra filas que el visor pueda borrar
select pg_temp.eq((select count(*) from public.manufacturing_orders), 7::bigint, 'el visor no borró nada');
set test.uid = 'aaaaaaaa-0000-0000-0000-000000000002';
insert into public.order_items (workspace_id, order_id, position, title, quantity, unit_price) select workspace_id, id, 9, 'Extra', 1, 1000 from public.production_orders limit 1;
select pg_temp.eq((select count(*) from public.order_items), 9::bigint, 'el editor agrega una línea');
update public.manufacturing_orders set notes = 'turno de la tarde', printer_id = 'c0000000-0000-0000-0000-000000000001' where kind = 'restock';
select pg_temp.fails($$update public.manufacturing_orders set status = 'done', quality_result = 'passed', produced_qty = 9$$, 'el editor no cambia el avance directamente');
select pg_temp.fails($$update public.manufacturing_orders set produced_qty = 99$$, 'el editor no cambia lo producido directamente');
select pg_temp.fails($$insert into public.product_variants (workspace_id, product_id, name, stock_qty) values ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000001', 'Con stock', 50)$$, 'el editor no fija stock de una variante');
select pg_temp.fails($$update public.product_variants set stock_qty = 50$$, 'el editor no modifica stock de una variante');
select pg_temp.fails($$truncate public.products$$, 'TRUNCATE retirado a la API');
select pg_temp.eq((select count(*) from information_schema.table_privileges where grantee = 'authenticated' and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES') and table_schema = 'public' and table_name in ('cost_items', 'print_jobs', 'products', 'workspace_invites', 'workspace_members', 'workspace_settings', 'workspaces', 'product_cost_summary')), 0::bigint, 'ningún TRUNCATE/TRIGGER/REFERENCES queda para la API en las 8 tablas y vistas corregidas');
select pg_temp.fails($$insert into public.brand_assets (workspace_id, created_by) values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003')$$, 'brand_assets: created_by debe ser quien inserta');
insert into public.brand_assets (workspace_id) values ('11111111-1111-1111-1111-111111111111');
set test.uid = 'aaaaaaaa-0000-0000-0000-000000000009';
select pg_temp.eq((select count(*) from public.order_items), 0::bigint, 'otro taller no ve líneas');
select pg_temp.eq((select count(*) from public.manufacturing_orders), 0::bigint, 'otro taller no ve fabricación');
select pg_temp.eq((select count(*) from public.product_variants), 0::bigint, 'otro taller no ve variantes');
select pg_temp.fails($$insert into public.order_items (workspace_id, order_id, position, title, quantity, unit_price) select workspace_id, id, 7, 'x', 1, 1 from public.production_orders limit 1$$, 'otro taller no escribe en este');
reset role;

-- 5. Retroceso: desaparece lo agregado y los datos originales quedan intactos.
\ir ../../docs/migraciones/propuestas/BUSINESS_V1_ROLLBACK.sql
select pg_temp.eq((select count(*) from information_schema.tables where table_name in ('order_items', 'manufacturing_orders', 'manufacturing_materials', 'product_variants')), 0::bigint, 'tablas nuevas retiradas');
select pg_temp.eq((select count(*) from information_schema.columns where (table_name = 'products' and column_name in ('sku', 'category', 'subcategory', 'lead_time_minutes', 'fulfillment')) or (table_name = 'production_orders' and column_name in ('delivery_status', 'discount'))), 0::bigint, 'columnas nuevas retiradas');
select pg_temp.eq((select count(*) from public.production_orders), 8::bigint, 'pedidos originales intactos tras el retroceso');
select pg_temp.eq((select count(*) from public.products), 2::bigint, 'productos intactos tras el retroceso');
\echo TODO OK: propuesta, relleno, reglas, permisos y retroceso verificados en base local
