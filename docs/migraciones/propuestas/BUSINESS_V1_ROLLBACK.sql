-- KultiApp Business V1 · retroceso de BUSINESS_V1_PROPUESTA.sql. Solo toca lo que la propuesta agregó.
-- Las columnas y tablas nuevas se eliminan; los datos originales (production_orders, products, etc.) no se tocaron.
drop table if exists public.manufacturing_materials;
drop table if exists public.manufacturing_orders;
drop table if exists public.order_items;
drop table if exists public.product_variants;
alter table public.production_orders drop column if exists delivery_status, drop column if exists discount;
drop index if exists public.products_sku_unique;
drop index if exists public.products_category;
alter table public.products
  drop column if exists sku, drop column if exists category, drop column if exists subcategory,
  drop column if exists lead_time_minutes, drop column if exists fulfillment;
-- Los permisos retirados (A1) y la política de A0 se restauran solo si hiciera falta:
grant truncate, trigger, references on
  public.cost_items, public.print_jobs, public.products, public.workspace_invites,
  public.workspace_members, public.workspace_settings, public.workspaces
  to authenticated;
drop policy if exists brand_assets_insert on public.brand_assets;
create policy brand_assets_insert on public.brand_assets for insert to authenticated
  with check (private.can_edit_workspace(workspace_id) and created_by = auth.uid());
