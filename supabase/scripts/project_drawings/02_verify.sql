-- Project drawings: READ-ONLY checks to run AFTER all three migrations
-- and the Vault secret. Changes nothing. Every row must say ok = true.
with checks(check_name, ok, detail) as (
  values
  ('4 tables exist with RLS on',
   (select count(*) = 4 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'drawings' and c.relkind = 'r' and c.relrowsecurity
      and c.relname in ('folders', 'versions', 'notices', 'access')),
   'drawings.{folders,versions,notices,access}'),
  ('18 functions exist',
   (select count(*) = 18 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'drawings'),
   'helpers + RPCs in schema drawings, incl. the 2 file-name helpers and the 3 default-folder functions'),
  ('5 policies exist',
   (select count(*) = 5 from pg_policies
    where schemaname = 'drawings'),
   'select policies + folder insert'),
  ('anon cannot run any of them',
   not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'drawings'
                 and has_function_privilege('anon', p.oid, 'execute')),
   'no access without a login'),
  ('anon cannot use the schema',
   not has_schema_privilege('anon', 'drawings', 'usage'),
   'no access without a login'),
  ('authenticated can use the schema',
   has_schema_privilege('authenticated', 'drawings', 'usage'),
   'the app and the files service act as authenticated'),
  ('manage_project_maps is active and project-scoped',
   exists (select 1 from public.permission_catalog
           where name = 'manage_project_maps' and is_active and is_project_scoped),
   'inactive permissions are ignored by the resolver'),
  ('no leftover public.project_drawing_* tables',
   to_regclass('public.project_drawing_folders') is null,
   'the early dev-only layout must be gone'),
  ('file naming applied',
   exists (select 1 from information_schema.columns
           where table_schema = 'drawings' and table_name = 'versions'
             and column_name = 'original_file_name'),
   'migration 20261025120000_drawings_file_naming.sql'),
  ('standard file name rule',
   drawings.standard_file_name('Project 627H6I', 'خرائط معمارية', 3, 'pdf') = 'Project_627H6I-خرائط_معمارية-v3.pdf'
   and drawings.standard_file_name('a/b:c', 'A - B', 1, 'DWG') = 'abc-A_B-v1.dwg'
   and drawings.standard_file_name('???', '', 2, null) = 'project-section-v2.bin',
   '<project>-<map type>-v<version>.<ext>'),
  ('every version has a standard name',
   not exists (select 1 from drawings.versions v
               where v.original_file_name is null
                  or v.file_name !~ ('-v' || v.version || '\.[a-z0-9]{1,10}$')),
   'a false here means the naming migration did not run after the first one'),
  ('9 default folders, positions 1-9',
   (select count(*) = 9 and min(position) = 1 and max(position) = 9 from drawings.default_folders),
   'migration 20261027120000_drawings_default_folders.sql'),
  ('new projects get the default folders',
   exists (select 1 from pg_trigger
           where tgrelid = 'public.projects'::regclass and tgname = 'projects_seed_drawings' and not tgisinternal),
   'trigger projects_seed_drawings on public.projects'),
  ('every project was seeded once',
   not exists (select 1 from public.projects p
               where not exists (select 1 from drawings.seeded_projects s where s.project_id = p.id)),
   'drawings.seeded_projects'),
  ('every folder has a position',
   not exists (select 1 from drawings.folders where position is null),
   'drawings.folders.position orders the list'),
  ('files_service_secret exists in Vault',
   exists (select 1 from vault.secrets where name = 'files_service_secret'),
   'without it every upload/download/delete is refused')
)
select check_name, ok, detail from checks
union all
select 'info: who holds manage_project_maps',
       true,
       coalesce((select string_agg(r.name || ' (' || g.scope || ')', ', ')
                 from public.role_permission_grants g
                 join public.roles r on r.id = g.role_id
                 join public.permission_catalog p on p.id = g.permission_id
                 where p.name = 'manage_project_maps' and g.allowed),
                'no role yet - assign it in Settings > Permissions');
