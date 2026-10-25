-- Project drawings: UNDO the migration. Only for backing out the feature.
-- !! This deletes every drawing folder, version record, notice and access
-- !! row. It touches nothing that existed before the migration. Files on
-- !! the EGC server are NOT deleted; remove them separately if wanted.
-- Take a backup first. Also remove `drawings` from Project Settings >
-- Data API > Exposed schemas afterwards.
--
-- To undo ONLY the standard file names (keep the feature), do not run
-- this file; instead run, in one transaction:
--   update drawings.versions set file_name = original_file_name
--     where original_file_name is not null;
--   alter table drawings.versions drop column original_file_name;
--   drop function drawings.standard_file_name(text, text, integer, text);
--   drop function drawings.file_name_part(text, text);
-- and then re-run 20261020120000_project_drawings.sql (it restores the
-- old add_version; it is idempotent).
begin;

drop function if exists drawings.delete_folder(uuid);
drop function if exists drawings.delete_version(uuid);
drop function if exists drawings.file_for_download(uuid);
drop function if exists drawings.add_version(uuid, text, text, text, bigint, uuid[]);
drop function if exists drawings.set_access(uuid, jsonb);
drop function if exists drawings.mark_complied(uuid);
drop function if exists drawings.set_status(uuid, text, text);
drop function if exists drawings.my_caps(uuid);

drop table if exists drawings.access;
drop table if exists drawings.notices;
drop table if exists drawings.versions;
drop table if exists drawings.folders;

drop function if exists drawings.standard_file_name(text, text, integer, text);
drop function if exists drawings.file_name_part(text, text);
drop function if exists drawings.assert_files_service();
drop function if exists drawings.is_participant(uuid);
drop function if exists drawings.can(uuid, text);
drop function if exists drawings.on_team(uuid);
drop function if exists drawings.is_manager(uuid);

-- No cascade: if anything else was put in the schema, this fails and the
-- whole rollback is undone, rather than silently deleting it.
drop schema if exists drawings;

-- Put the catalog entry back the way it was before (inactive).
update public.permission_catalog set is_active = false where name = 'manage_project_maps';

-- Vault secret (optional):
-- delete from vault.secrets where name = 'files_service_secret';

notify pgrst, 'reload schema';

commit;
