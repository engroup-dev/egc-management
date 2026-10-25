-- =====================================================================
-- Project Drawings (Operations › الخرائط › project page)
-- =====================================================================
-- Per-project drawing folders (one per map_types row), versioned files,
-- a status per folder, "must comply" notices between folders, and
-- per-folder per-member access. Port of the "Site Docs – Project
-- Drawings" prototype.
--
-- Everything lives in its own schema, `drawings` (drawings.folders,
-- drawings.versions, drawings.notices, drawings.access and the
-- drawings.* functions), like boq / contracts / tasks. The schema must
-- be listed under Project Settings > Data API > Exposed schemas.
--
-- The files themselves do NOT live in Supabase Storage. They are kept on
-- the EGC server by the files service (its own repo,
-- github.com/engroup-dev/files-service-egc). That service calls the RPCs
-- below with the user's own JWT, so every permission decision is made
-- here. The RPCs that register,
-- reveal or delete a file also require the x-files-secret request
-- header, matched against the Vault secret `files_service_secret`, so
-- only the files service can call them (otherwise any uploader could
-- point a version row at an arbitrary path on the server).
--
-- Before running on an environment, create the Vault secret once:
--   select vault.create_secret('<long random string>', 'files_service_secret');
-- and give the same value to the files service as FILES_SERVICE_SECRET.
--
-- Idempotent: safe to run more than once. Additive only: it creates the
-- new schema and its objects and changes no existing row except
-- switching on the manage_project_maps catalog entry. Runs as one
-- transaction.
-- =====================================================================

begin;

-- Never queue behind a busy table (the foreign keys briefly lock
-- projects / map_types / users): fail cleanly instead, and retry later.
set local lock_timeout = '10s';

-- ---------------------------------------------------------------------
-- 0. Schema
-- ---------------------------------------------------------------------
create schema if not exists drawings;
revoke all on schema drawings from public, anon;
grant usage on schema drawings to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. Permission: manage_project_maps (project-scoped)
-- ---------------------------------------------------------------------
-- Managers add/delete folders, assign access, and have full access to
-- every folder of the project. The catalog row already exists (it was
-- created unused, granted to nobody); the insert only covers an
-- environment where it is missing.
insert into public.permission_catalog
  (name, area, description, is_project_scoped, is_active)
select
  'manage_project_maps',
  'Project',
  'تعديل خرائط المشروع ومناطقه.',
  true,
  true
where not exists (
  select 1 from public.permission_catalog where name = 'manage_project_maps'
);

-- The existing row was created inactive (like the other planned
-- manage_* permissions), and the resolver ignores inactive rows. This
-- feature implements it, so switch it on.
update public.permission_catalog
set is_active = true
where name = 'manage_project_maps' and not is_active;

-- No role, department or user is granted it here: whoever administers
-- permissions assigns it from Settings › Permissions. Until then nobody
-- is a drawings manager, and members only see the folders a manager
-- has opened to them.

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------
create table if not exists drawings.folders (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  map_type_id   uuid not null references public.map_types(id) on delete restrict,
  status        text not null default 'ok'
                check (status in ('ok', 'design', 'modification')),
  status_note   text,
  status_by     uuid references public.users(id) on delete set null,
  status_at     timestamptz,
  -- Next version number to hand out. Never reused, even after a version
  -- is deleted, so "Architecture v3" always means one file.
  next_version  integer not null default 1,
  created_by    uuid default auth.uid() references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (project_id, map_type_id)
);

create table if not exists drawings.versions (
  id           uuid primary key default gen_random_uuid(),
  folder_id    uuid not null references drawings.folders(id) on delete cascade,
  version      integer not null,
  file_path    text not null unique,
  file_name    text not null,
  mime_type    text,
  file_size    bigint,
  uploaded_by  uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (folder_id, version)
);

create table if not exists drawings.notices (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  from_folder_id  uuid not null references drawings.folders(id) on delete cascade,
  version_id      uuid not null references drawings.versions(id) on delete cascade,
  -- Copied so the receiving folder can show "Architecture v3" without
  -- being allowed to read the sending folder's versions.
  version_number  integer not null,
  to_folder_id    uuid not null references drawings.folders(id) on delete cascade,
  state           text not null default 'pending'
                  check (state in ('pending', 'complied', 'superseded')),
  resolved_by     uuid references public.users(id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (version_id, to_folder_id),
  check (to_folder_id <> from_folder_id)
);

create index if not exists notices_to_pending_idx
  on drawings.notices (to_folder_id) where state = 'pending';
create index if not exists notices_from_pending_idx
  on drawings.notices (from_folder_id) where state = 'pending';
create index if not exists notices_version_idx
  on drawings.notices (version_id);

-- A row means "may view this folder"; the flags add the rest.
create table if not exists drawings.access (
  folder_id     uuid not null references drawings.folders(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  can_download  boolean not null default false,
  can_upload    boolean not null default false,
  can_edit      boolean not null default false,
  granted_by    uuid references public.users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  primary key (folder_id, user_id)
);

create index if not exists access_user_idx
  on drawings.access (user_id);

-- ---------------------------------------------------------------------
-- 3. Helpers (security definer so RLS policies can call them without
--    recursing into the tables' own policies)
-- ---------------------------------------------------------------------
create or replace function drawings.is_manager(p_project_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or p_project_id is null then
    return false;
  end if;
  return coalesce(public.can_i('manage_project_maps', p_project_id), false);
end;
$$;

-- Access rows only count while the person is still on the project team.
create or replace function drawings.on_team(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.team_assignments t
    where t.project_id = p_project_id and t.person_id = auth.uid()
  );
$$;

-- p_cap: 'view' | 'download' | 'upload' | 'edit'
create or replace function drawings.can(p_folder_id uuid, p_cap text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_project uuid;
  a drawings.access%rowtype;
begin
  if auth.uid() is null then
    return false;
  end if;

  select project_id into v_project
  from drawings.folders where id = p_folder_id;
  if v_project is null then
    return false;
  end if;

  if drawings.is_manager(v_project) then
    return true;
  end if;

  select * into a from drawings.access
  where folder_id = p_folder_id and user_id = auth.uid();
  if not found or not drawings.on_team(v_project) then
    return false;
  end if;

  return case p_cap
    when 'view'     then true
    when 'download' then a.can_download
    when 'upload'   then a.can_upload
    when 'edit'     then a.can_edit
    else false
  end;
end;
$$;

-- Managers, plus anyone holding access to at least one folder of the
-- project while on its team. Participants may read every folder's name
-- and status (needed for the notify checklist and "must comply" text);
-- files and versions stay per-folder.
create or replace function drawings.is_participant(p_project_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if drawings.is_manager(p_project_id) then
    return true;
  end if;
  return drawings.on_team(p_project_id) and exists (
    select 1
    from drawings.access a
    join drawings.folders f on f.id = a.folder_id
    where f.project_id = p_project_id and a.user_id = auth.uid()
  );
end;
$$;

-- Everything the UI needs to decide what to show, in one call:
-- { "is_manager": bool,
--   "folders": { "<folder id>": { "view", "download", "upload", "edit" } } }
create or replace function drawings.my_caps(p_project_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_manager boolean := drawings.is_manager(p_project_id);
  v_on_team boolean := drawings.on_team(p_project_id);
  v_folders jsonb;
begin
  select coalesce(jsonb_object_agg(f.id, jsonb_build_object(
           'view',     v_manager or (v_on_team and a.folder_id is not null),
           'download', v_manager or (v_on_team and coalesce(a.can_download, false)),
           'upload',   v_manager or (v_on_team and coalesce(a.can_upload, false)),
           'edit',     v_manager or (v_on_team and coalesce(a.can_edit, false))
         )), '{}'::jsonb)
  into v_folders
  from drawings.folders f
  left join drawings.access a
    on a.folder_id = f.id and a.user_id = auth.uid()
  where f.project_id = p_project_id;

  return jsonb_build_object('is_manager', v_manager, 'folders', v_folders);
end;
$$;

-- Raises unless the request came from the files service.
create or replace function drawings.assert_files_service()
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_expected text;
  v_got text;
begin
  select decrypted_secret into v_expected
  from vault.decrypted_secrets where name = 'files_service_secret' limit 1;

  v_got := nullif(current_setting('request.headers', true), '')::json ->> 'x-files-secret';

  if v_expected is null or v_got is null or v_got <> v_expected then
    raise exception 'هذه العملية متاحة لخدمة الملفات فقط' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Row level security
-- ---------------------------------------------------------------------
alter table drawings.folders  enable row level security;
alter table drawings.versions enable row level security;
alter table drawings.notices  enable row level security;
alter table drawings.access   enable row level security;

revoke all on drawings.folders, drawings.versions,
              drawings.notices, drawings.access
  from anon;
grant select on drawings.folders, drawings.versions,
                drawings.notices, drawings.access
  to authenticated;
grant insert on drawings.folders to authenticated;

drop policy if exists folders_select on drawings.folders;
create policy folders_select on drawings.folders
  for select to authenticated
  using (drawings.is_participant(project_id));

drop policy if exists folders_insert on drawings.folders;
create policy folders_insert on drawings.folders
  for insert to authenticated
  with check (
    drawings.is_manager(project_id)
    and status = 'ok' and next_version = 1
  );

drop policy if exists versions_select on drawings.versions;
create policy versions_select on drawings.versions
  for select to authenticated
  using (drawings.can(folder_id, 'view'));

drop policy if exists notices_select on drawings.notices;
create policy notices_select on drawings.notices
  for select to authenticated
  using (drawings.can(to_folder_id, 'view')
         or drawings.can(from_folder_id, 'view'));

drop policy if exists access_select on drawings.access;
create policy access_select on drawings.access
  for select to authenticated
  using (
    user_id = auth.uid()
    or drawings.is_manager(
         (select f.project_id from drawings.folders f where f.id = folder_id))
  );

-- ---------------------------------------------------------------------
-- 5. RPCs called by the desktop app
-- ---------------------------------------------------------------------
create or replace function drawings.set_status(
  p_folder_id uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not drawings.can(p_folder_id, 'upload') then
    raise exception 'ليست لديك صلاحية تغيير حالة هذه الخرائط' using errcode = '42501';
  end if;
  if p_status not in ('ok', 'design', 'modification') then
    raise exception 'حالة غير صالحة' using errcode = '22023';
  end if;

  update drawings.folders set
    status      = p_status,
    status_note = case when p_status = 'ok' then null else nullif(btrim(p_note), '') end,
    status_by   = case when p_status = 'ok' then null else auth.uid() end,
    status_at   = case when p_status = 'ok' then null else now() end
  where id = p_folder_id;
end;
$$;

create or replace function drawings.mark_complied(p_notice_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  n drawings.notices%rowtype;
begin
  select * into n from drawings.notices where id = p_notice_id for update;
  if not found then
    raise exception 'الإشعار غير موجود' using errcode = 'P0002';
  end if;
  if not drawings.can(n.to_folder_id, 'edit') then
    raise exception 'ليست لديك صلاحية تأكيد الالتزام' using errcode = '42501';
  end if;
  if n.state <> 'pending' then
    return;
  end if;

  update drawings.notices
  set state = 'complied', resolved_by = auth.uid(), resolved_at = now()
  where id = p_notice_id;
end;
$$;

-- p_entries: [{ "user_id": uuid, "download": bool, "upload": bool, "edit": bool }, ...]
-- Replaces the folder's access list in one transaction. Every user must
-- be on the project team.
create or replace function drawings.set_access(p_folder_id uuid, p_entries jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_project uuid;
  v_bad integer;
begin
  select project_id into v_project
  from drawings.folders where id = p_folder_id for update;
  if v_project is null then
    raise exception 'نوع الخريطة غير موجود' using errcode = 'P0002';
  end if;
  if not drawings.is_manager(v_project) then
    raise exception 'ليست لديك صلاحية إدارة الوصول' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_entries, '[]'::jsonb)) <> 'array' then
    raise exception 'بيانات غير صالحة' using errcode = '22023';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e
  where not exists (
    select 1 from public.team_assignments t
    where t.project_id = v_project and t.person_id = (e ->> 'user_id')::uuid
  );
  if v_bad > 0 then
    raise exception 'يمكن منح الوصول لأعضاء فريق المشروع فقط' using errcode = '22023';
  end if;

  delete from drawings.access where folder_id = p_folder_id;

  insert into drawings.access
    (folder_id, user_id, can_download, can_upload, can_edit, granted_by, updated_at)
  select distinct on ((e ->> 'user_id')::uuid)
         p_folder_id,
         (e ->> 'user_id')::uuid,
         coalesce((e ->> 'download')::boolean, false),
         coalesce((e ->> 'upload')::boolean, false),
         coalesce((e ->> 'edit')::boolean, false),
         auth.uid(),
         now()
  from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. RPCs called only by the files service (x-files-secret required)
-- ---------------------------------------------------------------------
-- Registers an uploaded file as the next version of the folder, resets
-- the folder status, and creates "must comply" notices for the chosen
-- folders (superseding still-pending ones from this folder to them).
create or replace function drawings.add_version(
  p_folder_id uuid,
  p_file_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint,
  p_notify_folder_ids uuid[] default '{}')
returns table (id uuid, version integer)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_project uuid;
  v_version integer;
  v_id uuid;
  v_targets uuid[] := array(select distinct x from unnest(coalesce(p_notify_folder_ids, '{}')) x);
  v_valid integer;
begin
  perform drawings.assert_files_service();

  select f.project_id, f.next_version into v_project, v_version
  from drawings.folders f where f.id = p_folder_id for update;
  if v_project is null then
    raise exception 'نوع الخريطة غير موجود' using errcode = 'P0002';
  end if;
  if not drawings.can(p_folder_id, 'upload') then
    raise exception 'ليست لديك صلاحية رفع ملفات لهذه الخرائط' using errcode = '42501';
  end if;
  if p_file_path !~ ('^drawings/' || v_project || '/' || p_folder_id
                     || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,10}$') then
    raise exception 'مسار ملف غير صالح' using errcode = '22023';
  end if;

  select count(*) into v_valid
  from drawings.folders f
  where f.id = any (v_targets) and f.project_id = v_project and f.id <> p_folder_id;
  if v_valid <> coalesce(array_length(v_targets, 1), 0) then
    raise exception 'قائمة أنواع الخرائط المطلوب إشعارها غير صالحة' using errcode = '22023';
  end if;

  insert into drawings.versions
    (folder_id, version, file_path, file_name, mime_type, file_size, uploaded_by)
  values
    (p_folder_id, v_version, p_file_path, coalesce(nullif(btrim(p_file_name), ''), 'file'),
     p_mime_type, p_file_size, auth.uid())
  returning versions.id into v_id;

  update drawings.folders set
    next_version = v_version + 1,
    status = 'ok', status_note = null, status_by = null, status_at = null
  where folders.id = p_folder_id;

  update drawings.notices n
  set state = 'superseded', resolved_by = auth.uid(), resolved_at = now()
  where n.from_folder_id = p_folder_id
    and n.state = 'pending'
    and n.to_folder_id = any (v_targets);

  insert into drawings.notices
    (project_id, from_folder_id, version_id, version_number, to_folder_id)
  select v_project, p_folder_id, v_id, v_version, t
  from unnest(v_targets) t;

  return query select v_id, v_version;
end;
$$;

create or replace function drawings.file_for_download(p_version_id uuid)
returns table (file_path text, file_name text, mime_type text, file_size bigint)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v drawings.versions%rowtype;
begin
  perform drawings.assert_files_service();

  select * into v from drawings.versions where versions.id = p_version_id;
  if not found then
    raise exception 'الملف غير موجود' using errcode = 'P0002';
  end if;
  if not drawings.can(v.folder_id, 'download') then
    raise exception 'ليست لديك صلاحية تنزيل هذا الملف' using errcode = '42501';
  end if;

  return query select v.file_path, v.file_name, v.mime_type, v.file_size;
end;
$$;

-- Deletes one version (its notices go with it) and returns the file path
-- for the service to remove from disk.
create or replace function drawings.delete_version(p_version_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v drawings.versions%rowtype;
begin
  perform drawings.assert_files_service();

  select * into v from drawings.versions where id = p_version_id;
  if not found then
    raise exception 'الملف غير موجود' using errcode = 'P0002';
  end if;
  if not drawings.can(v.folder_id, 'edit') then
    raise exception 'ليست لديك صلاحية حذف هذا الإصدار' using errcode = '42501';
  end if;

  delete from drawings.versions where id = p_version_id;
  return v.file_path;
end;
$$;

-- Deletes a folder with its versions, notices to/from it and its access
-- list, and returns every file path for the service to remove.
create or replace function drawings.delete_folder(p_folder_id uuid)
returns setof text
language plpgsql security definer set search_path = ''
as $$
declare
  v_project uuid;
  v_paths text[];
begin
  perform drawings.assert_files_service();

  select project_id into v_project from drawings.folders where id = p_folder_id;
  if v_project is null then
    raise exception 'نوع الخريطة غير موجود' using errcode = 'P0002';
  end if;
  if not drawings.is_manager(v_project) then
    raise exception 'ليست لديك صلاحية حذف نوع الخريطة' using errcode = '42501';
  end if;

  select coalesce(array_agg(file_path), '{}') into v_paths
  from drawings.versions where folder_id = p_folder_id;

  delete from drawings.folders where id = p_folder_id;
  return query select unnest(v_paths);
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Function privileges
-- ---------------------------------------------------------------------
revoke all on function drawings.is_manager(uuid)              from public, anon;
revoke all on function drawings.on_team(uuid)                 from public, anon;
revoke all on function drawings.can(uuid, text)               from public, anon;
revoke all on function drawings.is_participant(uuid)          from public, anon;
revoke all on function drawings.my_caps(uuid)                 from public, anon;
revoke all on function drawings.assert_files_service()        from public, anon;
revoke all on function drawings.set_status(uuid, text, text)  from public, anon;
revoke all on function drawings.mark_complied(uuid)           from public, anon;
revoke all on function drawings.set_access(uuid, jsonb)       from public, anon;
revoke all on function drawings.add_version(uuid, text, text, text, bigint, uuid[]) from public, anon;
revoke all on function drawings.file_for_download(uuid)       from public, anon;
revoke all on function drawings.delete_version(uuid)          from public, anon;
revoke all on function drawings.delete_folder(uuid)           from public, anon;

grant execute on function drawings.is_manager(uuid)             to authenticated;
grant execute on function drawings.on_team(uuid)                to authenticated;
grant execute on function drawings.can(uuid, text)              to authenticated;
grant execute on function drawings.is_participant(uuid)         to authenticated;
grant execute on function drawings.my_caps(uuid)                to authenticated;
grant execute on function drawings.assert_files_service()       to authenticated;
grant execute on function drawings.set_status(uuid, text, text) to authenticated;
grant execute on function drawings.mark_complied(uuid)          to authenticated;
grant execute on function drawings.set_access(uuid, jsonb)      to authenticated;
grant execute on function drawings.add_version(uuid, text, text, text, bigint, uuid[]) to authenticated;
grant execute on function drawings.file_for_download(uuid)      to authenticated;
grant execute on function drawings.delete_version(uuid)         to authenticated;
grant execute on function drawings.delete_folder(uuid)          to authenticated;

-- Let PostgREST see the new schema objects without a restart.
notify pgrst, 'reload schema';

commit;
