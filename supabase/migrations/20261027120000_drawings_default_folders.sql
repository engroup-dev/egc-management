-- =====================================================================
-- Project Drawings: default folders for every project, in a fixed order
-- =====================================================================
-- Every project starts with the same nine drawing folders, in this order:
--
--   1 رفع مساحي              4 تصميم داخلي        7 سباكة
--   2 خرائط معمارية           5 منظومة تكييف       8 كهرباء
--   3 انشائية                 6 منظومة الحريق      9 الحدائق و المنطقة الخارجية
--
-- Users may remove any of them (drawings.delete_folder) and add other
-- map types; added folders are listed after the defaults, in the order
-- they were added.
--
-- * Each default reuses the existing map type that means the same thing
--   (keeping its current name); only missing ones are created in
--   public.map_types, under the names above. The mapping is stored in
--   drawings.default_folders and can be changed later with SQL.
-- * drawings.folders.position orders the folders. A trigger sets it on
--   every insert: a default map type always gets its own slot (so a
--   removed default that is added back returns to its place), any other
--   type goes after the defaults and after the folders already there.
-- * A project is seeded once (drawings.seeded_projects): a default the
--   users removed is never re-created, not even by re-running this file.
-- * New projects are seeded by an AFTER INSERT trigger on public.projects
--   (shared with the Fields app, so projects created there get the
--   folders too). Every existing project is seeded once by this file.
--
-- Runs AFTER 20261020120000_project_drawings.sql and
-- 20261025120000_drawings_file_naming.sql. Idempotent and additive: adds
-- two tables, one column, three functions and two triggers, may add up
-- to nine map types, and adds folders; it changes no existing row except
-- giving existing folders a position.
-- =====================================================================

begin;
set local lock_timeout = '10s';

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------
create table if not exists drawings.default_folders (
  position     integer primary key check (position between 1 and 99),
  map_type_id  uuid not null unique references public.map_types(id) on delete cascade
);

create table if not exists drawings.seeded_projects (
  project_id  uuid primary key references public.projects(id) on delete cascade,
  seeded_at   timestamptz not null default now()
);

-- Only the definer functions below read or write these.
alter table drawings.default_folders enable row level security;
alter table drawings.seeded_projects enable row level security;
revoke all on drawings.default_folders, drawings.seeded_projects from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. The nine defaults: reuse the first existing map type whose
--    (trimmed) name is in the list, else create one. Positions already
--    set are left alone, so a later change made with SQL survives a
--    re-run.
-- ---------------------------------------------------------------------
do $$
declare
  d record;
  v_id uuid;
begin
  for d in
    select * from (values
      (1, 'رفع مساحي',                   array['رفع مساحي']),
      (2, 'خرائط معمارية',               array['خرائط معمارية', 'معمارية']),
      (3, 'انشائية',                     array['تصميم انشائي', 'خرائط إنشائية', 'خرائط انشائية', 'إنشائية', 'انشائية']),
      (4, 'تصميم داخلي',                 array['تصميم داخلي', 'خرائط تصميم داخلي']),
      (5, 'منظومة تكييف',                array['تصميم التكيف', 'تصميم تكيف', 'تصميم تكييف', 'منظومة تكييف', 'خرائط تكييف']),
      (6, 'منظومة الحريق',               array['خرائط منظومه الحريق', 'خرائط منظومة الحريق', 'منظومة الحريق', 'خرائط الحريق']),
      (7, 'سباكة',                       array['تصميم السباكه', 'تصميم اعمال سباكة', 'تصميم أعمال السباكة', 'سباكة', 'خرائط سباكة']),
      (8, 'كهرباء',                      array['خرائط كهربائية', 'خرائط كهرباء', 'كهرباء']),
      (9, 'الحدائق و المنطقة الخارجية',  array['خرائط الحدائق و المنطقه الخارجيه', 'خرائط الحدائق و المنطقة الخارجية', 'الحدائق و المنطقة الخارجية', 'الحدائق والمنطقة الخارجية'])
    ) as t(pos, create_name, names)
  loop
    continue when exists (select 1 from drawings.default_folders where position = d.pos);

    select m.id into v_id
    from public.map_types m
    join unnest(d.names) with ordinality as n(name, ord) on btrim(m.name) = n.name
    order by n.ord, m.created_at
    limit 1;

    if v_id is null then
      insert into public.map_types (name) values (d.create_name) returning id into v_id;
    end if;

    insert into drawings.default_folders (position, map_type_id)
    values (d.pos, v_id)
    on conflict do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Folder order
-- ---------------------------------------------------------------------
alter table drawings.folders add column if not exists position integer;

-- Existing folders: defaults take their slot, the rest go after the
-- defaults in the order they were created.
update drawings.folders f
set position = d.position
from drawings.default_folders d
where d.map_type_id = f.map_type_id
  and f.position is null;

with numbered as (
  select f.id,
         (select coalesce(max(d.position), 0) from drawings.default_folders d)
           + row_number() over (partition by f.project_id order by f.created_at, f.id) as pos
  from drawings.folders f
  where f.position is null
)
update drawings.folders f
set position = numbered.pos
from numbered
where numbered.id = f.id;

alter table drawings.folders alter column position set not null;
-- The trigger always overwrites it; the default only lets clients
-- (and the generated types) leave it out.
alter table drawings.folders alter column position set default 0;
create index if not exists folders_project_position_idx on drawings.folders (project_id, position);

comment on column drawings.folders.position is
  'Display order. Set on insert by drawings.set_folder_position(): defaults get their drawings.default_folders slot, others go after.';

create or replace function drawings.set_folder_position()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.position := (select d.position from drawings.default_folders d
                   where d.map_type_id = new.map_type_id);
  if new.position is null then
    new.position := greatest(
      (select coalesce(max(f.position), 0) from drawings.folders f where f.project_id = new.project_id),
      (select coalesce(max(d.position), 0) from drawings.default_folders d)
    ) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists folders_set_position on drawings.folders;
create trigger folders_set_position
  before insert on drawings.folders
  for each row execute function drawings.set_folder_position();

-- ---------------------------------------------------------------------
-- 4. Seeding
-- ---------------------------------------------------------------------
-- Gives a project the default folders, once. Returns how many folders
-- were added (0 if the project was seeded before).
create or replace function drawings.seed_project_defaults(p_project_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_added integer;
begin
  insert into drawings.seeded_projects (project_id) values (p_project_id)
  on conflict do nothing;
  if not found then
    return 0;
  end if;

  -- created_by is left empty: inside the projects trigger auth.uid() may
  -- not be a public.users row.
  insert into drawings.folders (project_id, map_type_id, created_by)
  select p_project_id, d.map_type_id, null
  from drawings.default_folders d
  order by d.position
  on conflict (project_id, map_type_id) do nothing;
  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

create or replace function drawings.on_project_created()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform drawings.seed_project_defaults(new.id);
  return null;
end;
$$;

drop trigger if exists projects_seed_drawings on public.projects;
create trigger projects_seed_drawings
  after insert on public.projects
  for each row execute function drawings.on_project_created();

-- Every existing project, once.
select count(*) filter (where added > 0) as projects_seeded_now,
       coalesce(sum(added), 0)          as folders_added
from (select drawings.seed_project_defaults(p.id) as added from public.projects p) s;

-- ---------------------------------------------------------------------
-- 5. Function privileges: only triggers and this file call these.
-- ---------------------------------------------------------------------
revoke all on function drawings.set_folder_position()        from public, anon, authenticated;
revoke all on function drawings.seed_project_defaults(uuid)  from public, anon, authenticated;
revoke all on function drawings.on_project_created()         from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
