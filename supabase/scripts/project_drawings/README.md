# Project drawings: production rollout

The feature needs three things in this order:

1. The DB migrations (three files, in order).
2. The Vault secret.
3. The files service on the EGC server.

After those, release the app version that contains the feature.

**The migrations only add:**
- a new schema, `drawings`, the same way `boq`, `contracts` and `tasks` each have their own
- 4 tables in it: `drawings.folders`, `drawings.versions`, `drawings.notices`, `drawings.access`
- 18 functions in it (`drawings.my_caps`, `drawings.add_version`, …)
- their RLS policies
- (second file) standard file names, see below
- (third file) default folders for every project, see below

**Default folders.** Every project starts with nine folders, in this order: رفع مساحي, خرائط معمارية, انشائية, تصميم داخلي, منظومة تكييف, منظومة الحريق, سباكة, كهرباء, الحدائق و المنطقة الخارجية.
- Each default reuses the existing map type that means the same thing (keeping its name). Only missing ones are added to `public.map_types`, so they also appear in Settings › الخرائط and in finance. `01_preflight.sql` shows the mapping before you run it.
- Users can remove any folder and add others; added folders come after the defaults. A removed default is never re-created.
- New projects get the folders from a trigger on `public.projects`. **That table is shared with the Fields app**, so projects created there get them too. The migration fills every existing project once.
- The order is `drawings.folders.position`; the mapping is `drawings.default_folders`, and it can be changed later with SQL.

**Standard file names.** Users upload any file; the system names it
`<project name>-<map type name>-v<version>.<ext>`, e.g. `Project_627H6I-خرائط_معمارية-v3.pdf`.
- The name is made in `drawings.add_version` when the version number is handed out, so it is always right and can't be bypassed.
- Each part is cleaned: characters Windows/macOS forbid are dropped, `-` becomes `_`, spaces become `_`, at most 80 characters, so `-` only ever separates the parts.
- The uploader's own name is kept in `drawings.versions.original_file_name` and shown under the standard name in the app.
- Names are stamped at upload. Renaming a project or a map type later doesn't rename old versions.
- Files on the server keep their `<uuid>.<ext>` paths; only the name people see and download under is standard.

**It deletes, drops or rewrites nothing that already exists.** The single change to existing data is switching on the `manage_project_maps` row in `permission_catalog` (`is_active = true`). It runs as one transaction, so it either applies fully or not at all. It is idempotent, so running it twice is harmless.

**It grants `manage_project_maps` to nobody.** After the rollout, assign it in the app under Settings › Permissions (to a role, a department, a user or a project member). Until then:
- nobody can add map types to a project;
- only people given folder access by a manager see any drawings.

| File | What it does | Changes data? |
|---|---|---|
| `supabase/migrations/20261020120000_project_drawings.sql` | the feature | adds only |
| `supabase/migrations/20261025120000_drawings_file_naming.sql` | standard file names; run **after** the first | adds a column; renames existing drawing versions (none on a first rollout) |
| `supabase/migrations/20261027120000_drawings_default_folders.sql` | default folders; run **third** | may add up to 9 map types; adds folders to every project; adds a trigger on `public.projects` |
| `01_preflight.sql` | checks the DB has everything the migration needs | no (read-only) |
| `02_verify.sql` | checks the result | no (read-only) |
| `03_rollback.sql` | removes the feature's objects again | deletes drawings data only |

## Where to run it

Supabase dashboard → the **production** project (`bhcprgzqhvnymthgtvtw`) → **SQL Editor** → New query. Paste the whole file and click **Run**.

Each step below is one paste.

## When

- **Before** shipping an app build that contains the drawings page. Older app versions ignore the new tables, so the DB can safely go first.
- Preferably at a quiet time. The migration takes a second or two. While it adds its foreign keys, it briefly blocks writes to `projects`, `map_types` and `users`; reads are never blocked.

## Steps

### 0. Backup

Supabase dashboard → Database → Backups. Confirm there is a recent daily backup, or create a manual dump. Nothing in this migration should need it.

### 1. Pre-check (read-only)

Run `01_preflight.sql`.
- Every row must show `ok = true`.
- The `info:` rows tell you whether it already ran and whether the secret exists.
- If any check is `false`, **stop**: production differs from what the migration expects.

### 2. Migrations

Run these files, **in this order**, each as its own paste. The first two should finish with "Success. No rows returned"; the third shows how many projects and folders it seeded.
1. `supabase/migrations/20261020120000_project_drawings.sql`
2. `supabase/migrations/20261025120000_drawings_file_naming.sql`
3. `supabase/migrations/20261027120000_drawings_default_folders.sql`. Check the `info: default folder` rows of `01_preflight.sql` first.

Both are idempotent. If you ever re-run the first one, re-run the second one after it: the first one on its own puts back the old `add_version`, which doesn't make standard names. (`02_verify.sql` catches this: "every version has a standard name" turns false after the next upload.)

### 3. Expose the schema (once per environment)

Supabase dashboard → **Project Settings → Data API → Exposed schemas**. **Add** `drawings` to the existing list, keep every schema already there, then save.

Without this step the app and the files service get "schema must be one of the following" errors.

### 3b. Vault secret (once per environment)

The production files service already has its secret. It was generated on the EGC server, in `/opt/files-service/shared/.env` as `FILES_SERVICE_SECRET`. Print it from your own terminal, not through a chat:

```bash
ssher exec EGC -- grep FILES_SERVICE_SECRET /opt/files-service/shared/.env
```

Then run this in the SQL editor with that value:

```sql
select vault.create_secret('<the value>', 'files_service_secret');
```

- The value must be **identical** on both sides.
- It is not the dev value.
- Don't paste it in chats or commit it.

### 4. Verify (read-only)

Run `02_verify.sql`. Every row must show `ok = true`. The last row lists who holds `manage_project_maps` (nobody yet).

### 5. Files service

The service is its own repo, [files-service-egc](https://github.com/engroup-dev/files-service-egc). It deploys itself to `https://files.engroup.ly` through GitHub Actions; its README has the server setup. Its production `.env` (`/opt/files-service/shared/.env` on the EGC server) needs:
- the prod Supabase URL
- the prod anon key
- the secret from step 3b

After changing that file, recreate the container. The command is in the service README.

The app uses `https://files.engroup.ly` by default. Set `VITE_FILES_API_URL` at build time only if you use a different address.

### 6. Permissions

In the app (Settings › Permissions), grant `manage_project_maps` to whoever should manage project drawings.

## Rolling back

Take a backup first, then run `03_rollback.sql`. To undo only the standard file names and keep the feature, follow the comment at the top of that file instead.
- It drops only the `drawings` schema with its tables and functions, and switches `manage_project_maps` back off. It refuses to drop the schema if anything else was put in it.
- Afterwards, remove `drawings` from the exposed schemas (step 3).
- It deletes the drawings records. The files on the EGC server stay until you remove them yourself.
- Everything else in the database is untouched.

## Tested on dev (`efldlwxgttlqkydvkfzt`)

- The pre-check passes.
- The migration applies and re-applies cleanly.
- The post-check passes.
- The rollback was dry-run inside a rolled-back transaction: it removed exactly the new objects and left the rest in place.
- The `drawings` schema layout (2026-10-24): applied on dev, and the rows from the early `public.project_drawing_*` layout were copied over and the old objects dropped (a dev-only step; prod never had the old layout). Every test user sees the same folders and rights as before.
- Standard file names (2026-10-25): applied and re-applied on dev; the 8 existing versions were renamed and keep their original names. An upload done as an authenticated test user (rolled back) got `…-v4.pdf`, and the download returned the same name. The SQL rule and the app's preview copy gave identical output on 22 tricky names (Arabic, hyphens, slashes, tabs, non-breaking spaces, emoji, 120 characters, empty).
- **Still open on dev:** adding `drawings` to the exposed schemas needs the `data_api_config_write` permission, which the current account doesn't have.
