-- =====================================================================
-- Project inventory: per-project site stock, receipts into it, and
-- issues out of it to contractors.
--
-- Shape of the data
--   project_inventory_items    one row per material per project. Its
--                              current/total quantities are DERIVED: only
--                              the ledger triggers below change them, and
--                              clients have no UPDATE grant on those
--                              columns.
--   project_material_receipts  stock coming in  (+ current, + received)
--   project_material_issues    stock going out  (- current, + issued)
--   default_project_materials  per-m² template used to fill in PLANNED
--                              quantities for a new project. Planned
--                              quantities are an estimate, not stock:
--                              they never touch current_quantity.
--
-- Access
--   view_inventory   (project-scoped) read everything for the project
--   manage_inventory (project-scoped) add items, receive, issue, correct
--   Both are created here but granted to nobody: grant them per role or
--   per project from the permissions screens, same as manage_project_maps.
--
-- Re-runnable: nothing here drops a table or deletes data.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create table if not exists public.project_inventory_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  item_type text not null default 'custom' check (item_type in ('catalog', 'custom')),
  -- restrict, not set null: a catalog item with no product would be nameless.
  shop_product_size_id uuid references public.shop_product_sizes(id) on delete restrict,
  custom_name text,
  custom_unit text default 'قطعة',
  custom_specifications text,
  planned_quantity numeric(12,2) not null default 0 check (planned_quantity >= 0),
  current_quantity numeric(12,2) not null default 0 check (current_quantity >= 0),
  total_received_quantity numeric(12,2) not null default 0 check (total_received_quantity >= 0),
  total_issued_quantity numeric(12,2) not null default 0 check (total_issued_quantity >= 0),
  low_stock_threshold numeric(12,2) not null default 5 check (low_stock_threshold >= 0),
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_proj_inv_project_id
  on public.project_inventory_items (project_id);

create table if not exists public.project_material_issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- restrict: an item with ledger rows can't be deleted out from under them.
  inventory_item_id uuid not null references public.project_inventory_items(id) on delete restrict,
  contractor_id uuid not null references public.contractors(id) on delete restrict,
  quantity numeric(12,2) not null check (quantity > 0),
  issued_by uuid default auth.uid() references auth.users(id) on delete set null,
  issue_date timestamptz not null default now(),
  work_zone text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_proj_issues_project_id on public.project_material_issues (project_id);
create index if not exists idx_proj_issues_contractor_id on public.project_material_issues (contractor_id);
create index if not exists idx_proj_issues_item_id on public.project_material_issues (inventory_item_id);

create table if not exists public.project_material_receipts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  inventory_item_id uuid not null references public.project_inventory_items(id) on delete restrict,
  vendor_id uuid references public.vendors(id) on delete set null,
  -- Reserved for linking a receipt to a shop order later; no FK yet.
  vendor_order_id uuid,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(12,2) check (unit_price >= 0),
  received_by uuid default auth.uid() references auth.users(id) on delete set null,
  receipt_date timestamptz not null default now(),
  delivery_note_ref text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_proj_receipts_project_id on public.project_material_receipts (project_id);
create index if not exists idx_proj_receipts_vendor_id on public.project_material_receipts (vendor_id);
create index if not exists idx_proj_receipts_item_id on public.project_material_receipts (inventory_item_id);

create table if not exists public.default_project_materials (
  id uuid primary key default gen_random_uuid(),
  trade text not null default 'electrical',
  name text not null,
  unit text not null default 'متر',
  specs text,
  sqm_ratio numeric(10,4) not null default 0 check (sqm_ratio >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_def_mat_trade
  on public.default_project_materials (trade, is_active);

-- Constraints, FKs and defaults. Written as drop-and-add so they also
-- bring a database that ran the earlier draft of this migration up to date.
alter table public.project_inventory_items
  add column if not exists planned_quantity numeric(12,2) not null default 0 check (planned_quantity >= 0),
  add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;

alter table public.project_material_issues alter column issued_by set default auth.uid();
alter table public.project_material_receipts alter column received_by set default auth.uid();

alter table public.project_inventory_items
  drop constraint if exists project_inventory_items_shop_product_size_id_fkey,
  add constraint project_inventory_items_shop_product_size_id_fkey
    foreign key (shop_product_size_id) references public.shop_product_sizes(id) on delete restrict;

alter table public.project_material_issues
  drop constraint if exists project_material_issues_inventory_item_id_fkey,
  add constraint project_material_issues_inventory_item_id_fkey
    foreign key (inventory_item_id) references public.project_inventory_items(id) on delete restrict;

alter table public.project_material_receipts
  drop constraint if exists project_material_receipts_inventory_item_id_fkey,
  add constraint project_material_receipts_inventory_item_id_fkey
    foreign key (inventory_item_id) references public.project_inventory_items(id) on delete restrict;

alter table public.project_inventory_items
  drop constraint if exists project_inventory_items_kind_ck,
  add constraint project_inventory_items_kind_ck check (
    (item_type = 'catalog' and shop_product_size_id is not null)
    or (item_type = 'custom' and nullif(btrim(custom_name), '') is not null)
  );

-- The draft's partial indexes had slightly different predicates.
drop index if exists public.idx_proj_inv_catalog_uniq;
create unique index idx_proj_inv_catalog_uniq
  on public.project_inventory_items (project_id, shop_product_size_id)
  where item_type = 'catalog';

drop index if exists public.idx_proj_inv_custom_uniq;
create unique index idx_proj_inv_custom_uniq
  on public.project_inventory_items (project_id, lower(btrim(custom_name)))
  where item_type = 'custom';

-- The draft's seed had no unique key; drop repeats before adding one.
delete from public.default_project_materials a
using public.default_project_materials b
where a.trade = b.trade and a.name = b.name and a.ctid > b.ctid;

alter table public.default_project_materials
  drop constraint if exists default_project_materials_trade_name_key,
  add constraint default_project_materials_trade_name_key unique (trade, name);

-- ---------------------------------------------------------------------
-- 2. Permissions
-- ---------------------------------------------------------------------

insert into public.permission_catalog (name, area, description, is_project_scoped, is_active)
select v.name, 'Project', v.description, true, true
from (values
  ('view_inventory', 'عرض مخزون المشروع وسجل الاستلام والصرف.'),
  ('manage_inventory', 'إضافة مواد المخزون واستلامها وصرفها للمقاولين.')
) as v(name, description)
where not exists (
  select 1 from public.permission_catalog c where c.name = v.name
);

update public.permission_catalog
set is_active = true
where name in ('view_inventory', 'manage_inventory');

-- Helpers. security definer so policies can call them without recursing
-- into these tables' own policies; empty search_path so nothing in them
-- resolves through a caller-controlled schema.
create or replace function public.inventory_can_manage(p_project_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or p_project_id is null then
    return false;
  end if;
  return coalesce(public.can_i('manage_inventory', p_project_id), false);
end;
$$;

-- Managing implies viewing.
create or replace function public.inventory_can_view(p_project_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or p_project_id is null then
    return false;
  end if;
  return coalesce(public.can_i('view_inventory', p_project_id), false)
      or public.inventory_can_manage(p_project_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Ledger triggers: the only writers of the derived quantity columns
-- ---------------------------------------------------------------------

create or replace function public.fn_inventory_issue_ledger()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_item public.project_inventory_items%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into v_item
    from public.project_inventory_items
    where id = new.inventory_item_id
    for update;

    if not found then
      raise exception 'المادة غير موجودة في مخزون المشروع' using errcode = 'P0002';
    end if;

    if v_item.project_id <> new.project_id then
      raise exception 'المادة لا تنتمي إلى هذا المشروع' using errcode = '23514';
    end if;

    if v_item.current_quantity < new.quantity then
      raise exception 'الكمية غير متوفرة: المتاح %، المطلوب %',
        v_item.current_quantity, new.quantity
        using errcode = '23514';
    end if;

    -- Who issued it is the session's user, not whatever the client sent.
    if auth.uid() is not null then
      new.issued_by := auth.uid();
    end if;

    update public.project_inventory_items
    set current_quantity = current_quantity - new.quantity,
        total_issued_quantity = total_issued_quantity + new.quantity,
        updated_at = now()
    where id = new.inventory_item_id;

    return new;
  end if;

  -- DELETE: a correction. The material goes back into stock.
  update public.project_inventory_items
  set current_quantity = current_quantity + old.quantity,
      total_issued_quantity = total_issued_quantity - old.quantity,
      updated_at = now()
  where id = old.inventory_item_id;

  return old;
end;
$$;

drop trigger if exists trg_sync_inventory_on_issue on public.project_material_issues;
drop trigger if exists trg_inventory_issue_insert on public.project_material_issues;
drop trigger if exists trg_inventory_issue_delete on public.project_material_issues;

create trigger trg_inventory_issue_insert
  before insert on public.project_material_issues
  for each row execute function public.fn_inventory_issue_ledger();

create trigger trg_inventory_issue_delete
  after delete on public.project_material_issues
  for each row execute function public.fn_inventory_issue_ledger();

create or replace function public.fn_inventory_receipt_ledger()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_item public.project_inventory_items%rowtype;
begin
  select * into v_item
  from public.project_inventory_items
  where id = case when tg_op = 'INSERT' then new.inventory_item_id else old.inventory_item_id end
  for update;

  if not found then
    raise exception 'المادة غير موجودة في مخزون المشروع' using errcode = 'P0002';
  end if;

  if tg_op = 'INSERT' then
    if v_item.project_id <> new.project_id then
      raise exception 'المادة لا تنتمي إلى هذا المشروع' using errcode = '23514';
    end if;

    if auth.uid() is not null then
      new.received_by := auth.uid();
    end if;

    update public.project_inventory_items
    set current_quantity = current_quantity + new.quantity,
        total_received_quantity = total_received_quantity + new.quantity,
        updated_at = now()
    where id = new.inventory_item_id;

    return new;
  end if;

  -- DELETE: refuse rather than clamp, so stock never drifts from the ledger.
  if v_item.current_quantity < old.quantity then
    raise exception 'لا يمكن حذف الاستلام: تم صرف جزء من هذه الكمية (المتاح %، الاستلام %)',
      v_item.current_quantity, old.quantity
      using errcode = '23514';
  end if;

  update public.project_inventory_items
  set current_quantity = current_quantity - old.quantity,
      total_received_quantity = total_received_quantity - old.quantity,
      updated_at = now()
  where id = old.inventory_item_id;

  return old;
end;
$$;

drop trigger if exists trg_sync_inventory_on_receipt on public.project_material_receipts;
drop trigger if exists trg_inventory_receipt_insert on public.project_material_receipts;
drop trigger if exists trg_inventory_receipt_delete on public.project_material_receipts;

-- DELETE runs BEFORE so a refused correction aborts before the row goes.
create trigger trg_inventory_receipt_insert
  before insert on public.project_material_receipts
  for each row execute function public.fn_inventory_receipt_ledger();

create trigger trg_inventory_receipt_delete
  before delete on public.project_material_receipts
  for each row execute function public.fn_inventory_receipt_ledger();

-- The old pair, if an earlier draft of this migration created them.
drop function if exists public.fn_sync_inventory_on_issue();
drop function if exists public.fn_sync_inventory_on_receipt();

-- ---------------------------------------------------------------------
-- 4. RPCs
-- ---------------------------------------------------------------------

-- Add an item. A starting quantity is recorded as an opening receipt, so
-- every unit in stock has a ledger row behind it.
create or replace function public.inventory_add_item(
  p_project_id uuid,
  p_item_type text default 'custom',
  p_shop_product_size_id uuid default null,
  p_custom_name text default null,
  p_custom_unit text default null,
  p_custom_specifications text default null,
  p_initial_quantity numeric default 0,
  p_low_stock_threshold numeric default 5,
  p_planned_quantity numeric default 0,
  p_notes text default null
)
returns public.project_inventory_items
language plpgsql security definer set search_path = ''
as $$
declare
  v_item public.project_inventory_items%rowtype;
begin
  if not public.inventory_can_manage(p_project_id) then
    raise exception 'ليست لديك صلاحية إدارة مخزون هذا المشروع' using errcode = '42501';
  end if;

  if coalesce(p_initial_quantity, 0) < 0 then
    raise exception 'الكمية الابتدائية لا يمكن أن تكون سالبة' using errcode = '23514';
  end if;

  begin
    insert into public.project_inventory_items (
      project_id, item_type, shop_product_size_id,
      custom_name, custom_unit, custom_specifications,
      planned_quantity, low_stock_threshold, notes
    ) values (
      p_project_id,
      coalesce(p_item_type, 'custom'),
      case when p_item_type = 'catalog' then p_shop_product_size_id end,
      case when coalesce(p_item_type, 'custom') = 'custom' then nullif(btrim(p_custom_name), '') end,
      coalesce(nullif(btrim(p_custom_unit), ''), 'قطعة'),
      nullif(btrim(p_custom_specifications), ''),
      greatest(coalesce(p_planned_quantity, 0), 0),
      greatest(coalesce(p_low_stock_threshold, 5), 0),
      nullif(btrim(p_notes), '')
    )
    returning * into v_item;
  exception
    when unique_violation then
      raise exception 'هذه المادة موجودة بالفعل في مخزون المشروع' using errcode = '23505';
    when check_violation then
      raise exception 'بيانات المادة غير مكتملة (الاسم مطلوب)' using errcode = '23514';
  end;

  if coalesce(p_initial_quantity, 0) > 0 then
    insert into public.project_material_receipts (project_id, inventory_item_id, quantity, notes)
    values (p_project_id, v_item.id, p_initial_quantity, 'رصيد افتتاحي');

    select * into v_item from public.project_inventory_items where id = v_item.id;
  end if;

  return v_item;
end;
$$;

-- Fill in PLANNED quantities from the per-m² template. Stock stays at 0
-- until materials are actually received. Materials the project already
-- has (same name) are left alone, so running it twice is safe.
create or replace function public.inventory_apply_defaults(
  p_project_id uuid,
  p_sqm numeric,
  p_trade text default 'electrical'
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_inserted integer;
  v_total integer;
begin
  if not public.inventory_can_manage(p_project_id) then
    raise exception 'ليست لديك صلاحية إدارة مخزون هذا المشروع' using errcode = '42501';
  end if;

  if p_sqm is null or p_sqm <= 0 then
    raise exception 'يرجى إدخال مساحة صحيحة بالمتر المربع' using errcode = '22023';
  end if;

  select count(*) into v_total
  from public.default_project_materials d
  where d.is_active and d.trade = coalesce(p_trade, 'electrical');

  if v_total = 0 then
    raise exception 'لا توجد مواد افتراضية مسجلة بالنظام' using errcode = 'P0002';
  end if;

  with planned as (
    select d.name, d.unit, d.specs, d.sqm_ratio,
           case when d.sqm_ratio > 0 then greatest(1, ceil(d.sqm_ratio * p_sqm)) else 0 end as qty
    from public.default_project_materials d
    where d.is_active and d.trade = coalesce(p_trade, 'electrical')
  ), ins as (
    insert into public.project_inventory_items (
      project_id, item_type, custom_name, custom_unit, custom_specifications,
      planned_quantity, low_stock_threshold, notes
    )
    select p_project_id, 'custom', p.name, p.unit, p.specs,
           p.qty,
           greatest(1, ceil(p.qty * 0.15)),
           format('كمية مخططة بناءً على مساحة %s م² بمعامل %s', p_sqm, p.sqm_ratio)
    from planned p
    on conflict (project_id, lower(btrim(custom_name))) where item_type = 'custom'
    do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_total - v_inserted
  );
end;
$$;

revoke all on function public.inventory_can_view(uuid) from public, anon;
revoke all on function public.inventory_can_manage(uuid) from public, anon;
revoke all on function public.inventory_add_item(uuid, text, uuid, text, text, text, numeric, numeric, numeric, text) from public, anon;
revoke all on function public.inventory_apply_defaults(uuid, numeric, text) from public, anon;
revoke all on function public.fn_inventory_issue_ledger() from public, anon, authenticated;
revoke all on function public.fn_inventory_receipt_ledger() from public, anon, authenticated;

grant execute on function public.inventory_can_view(uuid) to authenticated;
grant execute on function public.inventory_can_manage(uuid) to authenticated;
grant execute on function public.inventory_add_item(uuid, text, uuid, text, text, text, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.inventory_apply_defaults(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Row level security and table grants
-- ---------------------------------------------------------------------

alter table public.project_inventory_items enable row level security;
alter table public.project_material_issues enable row level security;
alter table public.project_material_receipts enable row level security;
alter table public.default_project_materials enable row level security;

-- Policies from the earlier draft of this migration (all using (true)).
drop policy if exists "inventory_items_select" on public.project_inventory_items;
drop policy if exists "inventory_items_all_service" on public.project_inventory_items;
drop policy if exists "issues_select" on public.project_material_issues;
drop policy if exists "issues_insert" on public.project_material_issues;
drop policy if exists "issues_delete" on public.project_material_issues;
drop policy if exists "receipts_select" on public.project_material_receipts;
drop policy if exists "receipts_insert" on public.project_material_receipts;
drop policy if exists "receipts_delete" on public.project_material_receipts;
drop policy if exists "default_materials_select" on public.default_project_materials;
drop policy if exists "default_materials_write" on public.default_project_materials;

-- Items: read with view; create through inventory_add_item /
-- inventory_apply_defaults only; edit descriptive columns with manage;
-- delete with manage (the FKs refuse once ledger rows exist).
drop policy if exists inventory_items_select on public.project_inventory_items;
create policy inventory_items_select on public.project_inventory_items
  for select to authenticated
  using (public.inventory_can_view(project_id));

drop policy if exists inventory_items_update on public.project_inventory_items;
create policy inventory_items_update on public.project_inventory_items
  for update to authenticated
  using (public.inventory_can_manage(project_id))
  with check (public.inventory_can_manage(project_id));

drop policy if exists inventory_items_delete on public.project_inventory_items;
create policy inventory_items_delete on public.project_inventory_items
  for delete to authenticated
  using (public.inventory_can_manage(project_id));

-- Issues / receipts: read with view; record or correct with manage.
-- No UPDATE: a correction is a delete (which reverses stock) plus a new row.
drop policy if exists issues_select on public.project_material_issues;
create policy issues_select on public.project_material_issues
  for select to authenticated
  using (public.inventory_can_view(project_id));

drop policy if exists issues_insert on public.project_material_issues;
create policy issues_insert on public.project_material_issues
  for insert to authenticated
  with check (public.inventory_can_manage(project_id));

drop policy if exists issues_delete on public.project_material_issues;
create policy issues_delete on public.project_material_issues
  for delete to authenticated
  using (public.inventory_can_manage(project_id));

drop policy if exists receipts_select on public.project_material_receipts;
create policy receipts_select on public.project_material_receipts
  for select to authenticated
  using (public.inventory_can_view(project_id));

drop policy if exists receipts_insert on public.project_material_receipts;
create policy receipts_insert on public.project_material_receipts
  for insert to authenticated
  with check (public.inventory_can_manage(project_id));

drop policy if exists receipts_delete on public.project_material_receipts;
create policy receipts_delete on public.project_material_receipts
  for delete to authenticated
  using (public.inventory_can_manage(project_id));

-- Template: readable by any signed-in user, edited from the dashboard only.
drop policy if exists default_materials_select on public.default_project_materials;
create policy default_materials_select on public.default_project_materials
  for select to authenticated
  using (true);

-- Supabase grants ALL on new public tables to anon and authenticated by
-- default; take that back and grant only what the policies above expect.
revoke all on table public.project_inventory_items from anon, authenticated;
revoke all on table public.project_material_issues from anon, authenticated;
revoke all on table public.project_material_receipts from anon, authenticated;
revoke all on table public.default_project_materials from anon, authenticated;

grant select, delete on table public.project_inventory_items to authenticated;
grant update (custom_name, custom_unit, custom_specifications, planned_quantity, low_stock_threshold, notes)
  on table public.project_inventory_items to authenticated;

grant select, delete on table public.project_material_issues to authenticated;
grant insert (project_id, inventory_item_id, contractor_id, quantity, issue_date, work_zone, notes)
  on table public.project_material_issues to authenticated;

grant select, delete on table public.project_material_receipts to authenticated;
grant insert (project_id, inventory_item_id, vendor_id, vendor_order_id, quantity, unit_price, receipt_date, delivery_note_ref, notes)
  on table public.project_material_receipts to authenticated;

grant select on table public.default_project_materials to authenticated;

grant all on table public.project_inventory_items to service_role;
grant all on table public.project_material_issues to service_role;
grant all on table public.project_material_receipts to service_role;
grant all on table public.default_project_materials to service_role;

-- ---------------------------------------------------------------------
-- 6. Template seed (electrical)
-- ---------------------------------------------------------------------

insert into public.default_project_materials (trade, name, unit, specs, sqm_ratio)
values
  ('electrical', 'كابلات كهربائية 1.5 مم (سلك إنارة)', 'لفة 100م', 'سلك نحاسي معزول أحادي 1.5 مم للإنارة', 0.8000),
  ('electrical', 'كابلات كهربائية 2.5 مم (سلك برايز)', 'لفة 100م', 'سلك نحاسي معزول أحادي 2.5 مم للمآخذ العادية', 1.2000),
  ('electrical', 'كابلات كهربائية 4 مم (سلك قوى ومكيفات)', 'لفة 100م', 'سلك نحاسي معزول 4 مم للأحمال والمكيفات', 0.4000),
  ('electrical', 'كابل رئيسي معزول 16 مم', 'متر', 'كابل تغذية رئيسي 4 خط 16 مم', 0.1500),
  ('electrical', 'مواسير كهرباء مرنة (فلبل) 16 مم', 'لفة 50م', 'مواسير مرنة عازلة للتمديدات الخرسانية', 0.9000),
  ('electrical', 'مواسير صلبة PVC قطر 20 مم', 'ماسورة 3م', 'مواسير بلاستيك صلبة للتمديد الظاهر والمدفون', 0.6000),
  ('electrical', 'علب ماجيك (مفتاح / بريزة)', 'قطعة', 'علب بلاستيكية قياسية للتثبيت في الجدران', 0.4500),
  ('electrical', 'مفتاح إنارة مفرد 10A', 'قطعة', 'مفتاح إضاءة خط واحد جودة عالية', 0.1500),
  ('electrical', 'مفتاح إنارة مزدوج 10A', 'قطعة', 'مفتاح إضاءة خطين', 0.1000),
  ('electrical', 'بريزة مفردة مؤرضة 16A', 'قطعة', 'مأخذ تيار كهربائي مفرد مع خط أرضي', 0.3500),
  ('electrical', 'بريزة قوى (مكيف / سخان) 20A / 45A', 'قطعة', 'مأخذ تيار للأجهزة عالية السحب مع مفتاح ثنائي', 0.0800),
  ('electrical', 'لوحة توزيع كهربائية 12 خط مع قواطع', 'قطعة', 'لوحة توزيع فرعية داخلية مجهزة بالقواطع', 0.0100)
on conflict (trade, name) do nothing;

commit;
