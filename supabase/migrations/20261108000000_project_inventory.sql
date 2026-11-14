begin;

drop table if exists public.project_inventory_items cascade;
drop table if exists public.project_material_issues cascade;
drop table if exists public.project_material_receipts cascade;

create table public.project_inventory_items (
id uuid primary key default gen_random_uuid(),
project_id uuid not null references public.projects(id) on delete cascade,
item_type text not null default 'catalog' check (item_type in ('catalog', 'custom')),
shop_product_size_id uuid references public.shop_product_sizes(id) on delete set null,
custom_name text,
custom_unit text default 'قطعة',
custom_specifications text,
current_quantity numeric(12,2) not null default 0 check (current_quantity >= 0),
total_received_quantity numeric(12,2) not null default 0 check (total_received_quantity >= 0),
total_issued_quantity numeric(12,2) not null default 0 check (total_issued_quantity >= 0),
low_stock_threshold numeric(12,2) not null default 5 check (low_stock_threshold >= 0),
notes text,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
);

create unique index idx_proj_inv_catalog_uniq
on public.project_inventory_items (project_id, shop_product_size_id)
where item_type = 'catalog' and shop_product_size_id is not null;

create unique index idx_proj_inv_custom_uniq
on public.project_inventory_items (project_id, lower(trim(custom_name)))
where item_type = 'custom' and custom_name is not null;

create index idx_proj_inv_project_id
on public.project_inventory_items (project_id);

create table public.project_material_issues (
id uuid primary key default gen_random_uuid(),
project_id uuid not null references public.projects(id) on delete cascade,
inventory_item_id uuid not null references public.project_inventory_items(id) on delete cascade,
contractor_id uuid not null references public.contractors(id) on delete restrict,
quantity numeric(12,2) not null check (quantity > 0),
issued_by uuid references auth.users(id) on delete set null,
issue_date timestamptz not null default now(),
work_zone text,
notes text,
created_at timestamptz not null default now()
);

create index idx_proj_issues_project_id
on public.project_material_issues (project_id);

create index idx_proj_issues_contractor_id
on public.project_material_issues (contractor_id);

create index idx_proj_issues_item_id
on public.project_material_issues (inventory_item_id);

create table public.project_material_receipts (
id uuid primary key default gen_random_uuid(),
project_id uuid not null references public.projects(id) on delete cascade,
inventory_item_id uuid not null references public.project_inventory_items(id) on delete cascade,
vendor_id uuid references public.vendors(id) on delete set null,
vendor_order_id uuid,
quantity numeric(12,2) not null check (quantity > 0),
unit_price numeric(12,2) check (unit_price >= 0),
received_by uuid references auth.users(id) on delete set null,
receipt_date timestamptz not null default now(),
delivery_note_ref text,
notes text,
created_at timestamptz not null default now()
);

create index idx_proj_receipts_project_id
on public.project_material_receipts (project_id);

create index idx_proj_receipts_vendor_id
on public.project_material_receipts (vendor_id);

create index idx_proj_receipts_item_id
on public.project_material_receipts (inventory_item_id);

create table if not exists public.default_project_materials (
id uuid primary key default gen_random_uuid(),
trade text not null default 'electrical',
name text not null,
unit text not null default 'متر',
specs text,
sqm_ratio numeric(10,4) not null default 0,
is_active boolean not null default true,
created_at timestamptz not null default now()
);

create index if not exists idx_def_mat_trade
on public.default_project_materials (trade, is_active);

create or replace function public.fn_sync_inventory_on_issue()
returns trigger
language plpgsql
security definer
as $$
declare
v_available numeric(12,2);
begin
if (TG_OP = 'INSERT') then
select current_quantity into v_available
from public.project_inventory_items
where id = NEW.inventory_item_id
for update;

if not found then
raise exception 'Item not found in inventory';
end if;

if v_available < NEW.quantity then
raise exception 'Insufficient stock: available %, requested %', v_available, NEW.quantity;
end if;

update public.project_inventory_items
set current_quantity = current_quantity - NEW.quantity,
total_issued_quantity = total_issued_quantity + NEW.quantity,
updated_at = now()
where id = NEW.inventory_item_id;

return NEW;

elsif (TG_OP = 'DELETE') then
update public.project_inventory_items
set current_quantity = current_quantity + OLD.quantity,
total_issued_quantity = greatest(0, total_issued_quantity - OLD.quantity),
updated_at = now()
where id = OLD.inventory_item_id;

return OLD;
end if;

return null;
end;
$$;

drop trigger if exists trg_sync_inventory_on_issue on public.project_material_issues;
create trigger trg_sync_inventory_on_issue
after insert or delete on public.project_material_issues
for each row execute function public.fn_sync_inventory_on_issue();

create or replace function public.fn_sync_inventory_on_receipt()
returns trigger
language plpgsql
security definer
as $$
begin
if (TG_OP = 'INSERT') then
update public.project_inventory_items
set current_quantity = current_quantity + NEW.quantity,
total_received_quantity = total_received_quantity + NEW.quantity,
updated_at = now()
where id = NEW.inventory_item_id;

return NEW;

elsif (TG_OP = 'DELETE') then
update public.project_inventory_items
set current_quantity = greatest(0, current_quantity - OLD.quantity),
total_received_quantity = greatest(0, total_received_quantity - OLD.quantity),
updated_at = now()
where id = OLD.inventory_item_id;

return OLD;
end if;

return null;
end;
$$;

drop trigger if exists trg_sync_inventory_on_receipt on public.project_material_receipts;
create trigger trg_sync_inventory_on_receipt
after insert or delete on public.project_material_receipts
for each row execute function public.fn_sync_inventory_on_receipt();

insert into public.permission_catalog (name, area, description, is_project_scoped, is_active)
values
('manage_inventory', 'Project', 'Inventory and material management', true, true),
('view_inventory', 'Project', 'View project inventory and consumption ledger', true, true)
on conflict (name) do update
set is_active = true;

alter table public.project_inventory_items enable row level security;
alter table public.project_material_issues enable row level security;
alter table public.project_material_receipts enable row level security;
alter table public.default_project_materials enable row level security;

create policy "inventory_items_select" on public.project_inventory_items
for select to authenticated
using (true);

create policy "inventory_items_all_service" on public.project_inventory_items
for all to authenticated
using (true)
with check (true);

create policy "issues_select" on public.project_material_issues
for select to authenticated
using (true);

create policy "issues_insert" on public.project_material_issues
for insert to authenticated
with check (true);

create policy "issues_delete" on public.project_material_issues
for delete to authenticated
using (true);

create policy "receipts_select" on public.project_material_receipts
for select to authenticated
using (true);

create policy "receipts_insert" on public.project_material_receipts
for insert to authenticated
with check (true);

create policy "receipts_delete" on public.project_material_receipts
for delete to authenticated
using (true);

create policy "default_materials_select" on public.default_project_materials
for select to authenticated
using (true);

create policy "default_materials_write" on public.default_project_materials
for all to authenticated
using (true)
with check (true);

grant all on table public.project_inventory_items to authenticated, service_role;
grant all on table public.project_material_issues to authenticated, service_role;
grant all on table public.project_material_receipts to authenticated, service_role;
grant all on table public.default_project_materials to authenticated, service_role;

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
on conflict do nothing;

commit;
