# EGC Management (desktop app)

The main system of **EGC — المجموعة الهندسية**. It's a desktop app (Windows and macOS) that the office uses to run the company:

- **Projects:** the project file, team, roles, timeline and documents.
- **Finance:** expenses, incomes, payments, treasury, company accounts, profit distributions and payroll.
- **Contractors and vendors:** contractor payments, merging duplicates, bank details.
- **Operations:** contracts (rounds, quotes, milestones), quantities (BOQ) and maps.
- **Shop and purchasing orders.**
- **HR:** employees, documents, hiring and performance reviews.
- **CRM:** clients.
- **Tasks:** boards, Gantt and templates.
- **Settings:** roles, departments and permissions.

---

## 1. How it works

| Part                     | Details                                                                       |
| ------------------------ | ----------------------------------------------------------------------------- |
| App                      | Electron + React + TypeScript (Vite, Electron Forge)                          |
| Database, logins, files  | Supabase project **EGC**: ref `bhcprgzqhvnymthgtvtw`, region eu-central-1     |
| Uploaded files           | Supabase Storage buckets: `attachments`, `employees`, `reports`, `site-media` |
| Reports and PDF printing | `https://pdf-service.engroup.ly` (`VITE_MANAGEMENT_API_URL`)                  |
| Logs screen              | Logs service at `VITE_LOGS_API_URL`                                           |

**The same Supabase project also serves EGC's mobile apps and website.** A change to the database affects all of them.

---

## 2. Setting up a computer for development

**You need:**

- Node.js + npm
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- Docker Desktop (only needed for backups and restores)

```bash
npm install
npm run start      # run the app in development
npm run lint       # check the code
npm run types      # regenerate src/lib/supabase.ts from the live database (after any database change)
```

**The `.env` file** (never commit it; it's already in `.gitignore`):

| Name                      | What it is                                     | Where to get it                                        |
| ------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `VITE_SUPABASE_URL`       | The project URL                                | Supabase Dashboard → Project Settings → API            |
| `VITE_SUPABASE_ANON_KEY`  | Public (anon) key                              | same place                                             |
| `VITE_MANAGEMENT_API_URL` | PDF and management service                     | optional, defaults to `https://pdf-service.engroup.ly` |
| `VITE_LOGS_API_URL`       | Logs service                                   | optional                                               |
| `VITE_APP_VERSION`        | Version shown when not running inside Electron | optional                                               |

**Where things are in the code:** screens are in `src/pages/` and `src/components/`, data hooks in `src/hooks/`, and the Supabase clients in `src/lib/`. Coding conventions are in `AGENTS.md` and `CLAUDE.md`.

---

## 3. Releasing a new version (updating the app)

GitHub builds the app for you. Pushing a version tag runs the workflow in `.github/workflows/build.yml`. It builds the **Windows** and **macOS** installers and attaches them to a new GitHub release. No token or local build is needed.

1. **Change the version** in `package.json` (for example `1.1.9` → `1.1.10`), commit and push:
   ```bash
   git commit -am "v1.1.10"
   git push origin master
   ```
2. **Tag and push the tag.** This starts the build:
   ```bash
   git tag v1.1.17
   git push origin v1.1.17
   ```
3. **Wait for the build** on GitHub → Actions ("Build and Publish (Windows + macOS)").
4. **Publish the release.** The workflow creates a **draft**. Open GitHub → Releases, check the files, and press **Publish release**. Users can't see a draft.
5. **(Optional) Force everyone onto the new version.** Run this in the Supabase SQL editor:

   ```sql
   insert into public."update" (type, version, is_must) values ('desktop', '1.1.10', true);
   ```

   - On start-up, anyone running an older version gets a blocking screen with a button to the latest GitHub release.
   - The check runs before login. If it can't reach the database, it lets the user in rather than locking them out.

**Keys used by the build:** the workflow reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the repo's **GitHub Secrets** (Settings → Secrets and variables → Actions). If the Supabase keys ever change, update them there before releasing.

---

## 4. Backups

**When:** at least weekly, **and always before any database change.**

Run these from this repo's folder, which is linked to the Supabase project. Each `db dump` asks for the **database password** (Dashboard → Project Settings → Database). Docker must be running.

```bash
D=~/EGC-backups/$(date +%F)      # one folder per day, OUTSIDE any git repo
mkdir -p "$D/storage"

# 1. Database (three files together = a full database backup)
supabase db dump -f "$D/schema.sql"                          # tables, functions, triggers, policies, grants
supabase db dump --role-only -f "$D/roles.sql"               # role settings
supabase db dump --data-only --use-copy -f "$D/data.sql"     # all rows, including logins (auth.users)

# 2. Uploaded files (Storage is NOT in the database dump)
for b in attachments employees reports site-media; do
  supabase storage cp -r "ss:///$b" "$D/storage/$b" --linked --experimental -j 4
done
```

If a storage command says _"Access token not provided"_, run `supabase login` once and try again.

**Check the backup:**

- `data.sql` should end with `RESET ALL;`.
- `pg_dump` warnings about _"circular foreign-key constraints"_ are normal. The restore in §5 handles them.

**Keep backups safe:** they contain salaries, payroll, bank details and password hashes. Keep them off git and off shared drives; an encrypted disk or a password-protected archive is best. Keep more than one copy, and at least one off this computer.

---

## 5. Restoring after data loss

**First choice:** if the Supabase plan includes daily backups, use Dashboard → **Database → Backups** to restore the same project. It's the fastest way, and keys and URLs don't change.

**From your own backup files, into a new project:**

1. **Create a new Supabase project** in the same region (eu-central-1).
2. **Turn on the extensions** the database uses (Dashboard → Database → Extensions):
   - `pg_cron`
   - `pg_net`
   - `pgcrypto`
   - `uuid-ossp`
   - `pg_stat_statements`
   - `hypopg`
   - `index_advisor`
   - `supabase_vault` is usually already on.
3. **Get the new connection string** (Project Settings → Database → _Session pooler_, port 5432) and its password.
4. **Load the backup.** There's no `psql` on this Mac, so this runs it through Docker:

   ```bash
   D=~/EGC-backups/2026-10-15        # the backup folder to restore
   NEW_DB_URL='postgresql://postgres.<new-ref>:<password>@<host>:5432/postgres'

   docker run --rm -v "$D":/backup postgres:17 psql "$NEW_DB_URL" \
     --single-transaction --variable ON_ERROR_STOP=1 \
     --file /backup/roles.sql \
     --file /backup/schema.sql \
     --command 'SET session_replication_role = replica' \
     --file /backup/data.sql
   ```

   - It's all one transaction: if anything fails, nothing is loaded. Fix the error and run it again.
   - `session_replication_role = replica` switches foreign-key checks off while the data loads, which is why the circular-key warnings don't matter.

5. **Upload the files back to Storage:**
   ```bash
   supabase link --project-ref <new-ref>
   for b in attachments employees reports site-media; do
     supabase storage cp -r "$D/storage/$b" "ss:///$b" --linked --experimental -j 4
   done
   ```
6. **Re-create what isn't inside the database:**
   - **Edge function `send-push`**, and any secrets it needs.
   - **Auth settings:** site URL, redirect URLs, SMTP and email templates.
   - **Cron jobs** (Dashboard → Integrations → Cron). Check they came back and re-create any that are missing:
     - `tasks-scheduled-job` (`*/15 * * * *`)
     - `tick-negative-periods` (`0 15 * * *`)
     - `tick-account-negative-periods` (`2 15 * * *`)
7. **Point the app at the new project.** The new project has a new URL and new keys:
   - **GitHub Secrets** (§3) and your local `.env`: put in the new URL and keys.
   - **Release a new version** (§3) so users get the new keys.
   - **Types:** run `npm run types`.
   - **EGC's mobile apps and website** use the same database, so their URL and keys need updating too.
8. **Users:** everyone signs in again with their **same password**, since the password hashes are in the backup.

> **Practise this once** on a scratch project before you ever need it. A backup is only proven once it has been restored.

---

## 6. Security: current state and open items

- **Row-level security, step 1 (live since 2026-10-15):** nobody signed out can read or change data.
  - **Step 2 isn't done yet:** every signed-in account can still read everything, including contractors, vendors and clients.
  - **Every new table needs RLS turned on plus a policy**, or the app sees it as empty.
- **The service-role key was built into earlier versions of this app** (up to v1.1.12, as `VITE_SUPABASE_SERVICE_KEY`). Admin actions (creating accounts, deleting a just-created login, resetting passwords) now go through the `admin-users` Edge Function (`supabase/functions/admin-users/`), which checks the signed-in person's permission, and newer builds contain no key. **Installers published before still contain it and it stays valid until it is rotated.** The old `anon` and `service_role` keys can only be rotated together, which would break every shipped app, so first move the apps and Edge Functions to Supabase's new publishable/secret keys, then deactivate the legacy ones. Not done yet.
- **Known broken:** merging contractors (`merge_contractors` still updates tables that moved to the `contracts` schema).
