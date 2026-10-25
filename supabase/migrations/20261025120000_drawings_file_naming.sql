-- =====================================================================
-- Project Drawings: standard file names
-- =====================================================================
-- Every uploaded version is named by the system, not by the uploader:
--
--     <project name>-<map type name>-v<version>.<ext>
--     e.g.  Project_627H6I-خرائط_معمارية-v3.pdf
--
-- The name is made in drawings.add_version, the only write path and the
-- only place the version number is known for certain (it is handed out
-- under a row lock in the same transaction). It is stamped at upload
-- time: renaming a project or map type later does not rename old
-- versions, so a file already sent to someone keeps matching what the
-- app shows. The uploader's own file name is kept in
-- drawings.versions.original_file_name.
--
-- Each part is cleaned so "-" only ever separates the parts: characters
-- Windows/macOS forbid in file names and control characters are
-- dropped, "-" becomes "_", runs of spaces/underscores become one "_",
-- leading/trailing "_" and "." are trimmed, and a part is at most 80
-- characters. The app mirrors this rule for its upload preview
-- (src/components/operations/drawings/drawingFileName.ts); keep the two
-- in step.
--
-- Files on disk keep their <uuid>.<ext> paths; only the name users see
-- and download under changes. The files service needs no change: it
-- still sends the uploader's name as p_file_name.
--
-- Runs AFTER 20261020120000_project_drawings.sql. Idempotent and
-- additive: adds one column and two functions, replaces add_version
-- (same signature, same grants), and renames the existing versions
-- once. Do not re-run 20261020120000_project_drawings.sql on its own
-- after this file: it would put the old add_version back (re-run this
-- file after it if you ever do).
-- =====================================================================

begin;
set local lock_timeout = '10s';

alter table drawings.versions add column if not exists original_file_name text;

comment on column drawings.versions.file_name is
  'Standard name <project>-<map type>-v<version>.<ext>, set by drawings.add_version.';
comment on column drawings.versions.original_file_name is
  'The file name as the uploader had it.';

-- One part of a standard file name. p_fallback is used if nothing is
-- left after cleaning.
create or replace function drawings.file_name_part(p text, p_fallback text)
returns text
language sql immutable set search_path = ''
as $$
  select coalesce(nullif(btrim(left(
    regexp_replace(
      replace(
        regexp_replace(coalesce(p, ''), '[\\/:*?"<>|[:cntrl:]]', '', 'g'),
        '-', '_'),
      '[[:space:]_]+', '_', 'g'),
    80), '_.'), ''), p_fallback);
$$;

create or replace function drawings.standard_file_name(
  p_project text,
  p_section text,
  p_version integer,
  p_ext text)
returns text
language sql immutable set search_path = ''
as $$
  select drawings.file_name_part(p_project, 'project')
      || '-' || drawings.file_name_part(p_section, 'section')
      || '-v' || p_version
      || '.' || coalesce(nullif(lower(p_ext), ''), 'bin');
$$;

-- Same as in 20261020120000_project_drawings.sql except that file_name
-- is now the standard name and the uploader's name goes to
-- original_file_name.
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
  v_project_name text;
  v_section_name text;
  v_id uuid;
  v_targets uuid[] := array(select distinct x from unnest(coalesce(p_notify_folder_ids, '{}')) x);
  v_valid integer;
begin
  perform drawings.assert_files_service();

  select f.project_id, f.next_version, p.name, m.name
    into v_project, v_version, v_project_name, v_section_name
  from drawings.folders f
  join public.projects p on p.id = f.project_id
  join public.map_types m on m.id = f.map_type_id
  where f.id = p_folder_id
  for update of f;
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
    (folder_id, version, file_path, file_name, original_file_name, mime_type, file_size, uploaded_by)
  values
    (p_folder_id, v_version, p_file_path,
     drawings.standard_file_name(v_project_name, v_section_name, v_version,
                                 substring(p_file_path from '\.([a-z0-9]{1,10})$')),
     coalesce(nullif(btrim(p_file_name), ''), 'file'),
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

-- Rename the versions uploaded before this migration (once: rows that
-- already have an original_file_name are left alone).
update drawings.versions v
set original_file_name = v.file_name,
    file_name = drawings.standard_file_name(p.name, m.name, v.version,
                                            substring(v.file_path from '\.([a-z0-9]{1,10})$'))
from drawings.folders f
join public.projects p on p.id = f.project_id
join public.map_types m on m.id = f.map_type_id
where f.id = v.folder_id
  and v.original_file_name is null;

revoke all on function drawings.file_name_part(text, text)                      from public, anon;
revoke all on function drawings.standard_file_name(text, text, integer, text)   from public, anon;
revoke all on function drawings.add_version(uuid, text, text, text, bigint, uuid[]) from public, anon;

grant execute on function drawings.file_name_part(text, text)                    to authenticated;
grant execute on function drawings.standard_file_name(text, text, integer, text) to authenticated;
grant execute on function drawings.add_version(uuid, text, text, text, bigint, uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;
