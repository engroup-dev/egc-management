-- =====================================================================
-- Editing a pending contractor payment, keeping every old version
-- =====================================================================
-- A payment against an agreement can be corrected while it is still
-- pending — by whoever sent it, or by anyone with
-- view_all_project_agreements on the project (the same rule as
-- create_agreement_payment). Before each edit the row as it was is
-- copied to contracts.payment_versions, so the approver can see what
-- changed. Contractor, agreement, payment number, prev_amount and the
-- penalties already attached never change on an edit.
--
-- Writes only through contracts.edit_agreement_payment (SECURITY
-- DEFINER); the table itself is read-only to the apps.
-- =====================================================================

-- ─── Old versions ──────────────────────────────────────────────────────────

create table if not exists contracts.payment_versions (
  id               uuid primary key default gen_random_uuid(),
  payment_id       uuid not null references contracts.payments(id) on delete cascade,
  -- 1 = the payment as first sent
  version_no       int  not null,
  amount           numeric not null,
  penalty_amount   numeric not null,
  penalty_reason   text,
  payments_reason  text,
  method           public.payment_method not null,
  bank_name        text,
  bank_number      text,
  bank_holder_name text,
  -- who wrote this version and when (version 1 = the payment's creator)
  created_by       uuid not null,
  created_at       timestamptz not null,
  -- the edit that replaced this version
  change_note      text not null,
  edited_by        uuid not null,
  edited_at        timestamptz not null default now(),
  unique (payment_id, version_no)
);

alter table contracts.payment_versions enable row level security;

revoke all on contracts.payment_versions from anon, authenticated;
grant select on contracts.payment_versions to authenticated;

-- Same policies as contracts.agreement_versions.
drop policy if exists "authenticated read" on contracts.payment_versions;
create policy "authenticated read" on contracts.payment_versions
  for select to authenticated using (true);
drop policy if exists sec_gate_select on contracts.payment_versions;
create policy sec_gate_select on contracts.payment_versions as restrictive
  for select to authenticated using ((select public.sec_is_company()));
drop policy if exists sec_gate_insert on contracts.payment_versions;
create policy sec_gate_insert on contracts.payment_versions as restrictive
  for insert to authenticated with check ((select public.sec_is_company()));
drop policy if exists sec_gate_update on contracts.payment_versions;
create policy sec_gate_update on contracts.payment_versions as restrictive
  for update to authenticated using ((select public.sec_is_company()))
  with check ((select public.sec_is_company()));
drop policy if exists sec_gate_delete on contracts.payment_versions;
create policy sec_gate_delete on contracts.payment_versions as restrictive
  for delete to authenticated using ((select public.sec_is_company()));

-- How many times a payment was edited — lets lists mark "معدّلة"
-- without reading the versions.
alter table contracts.payments add column if not exists edit_count int not null default 0;

-- ─── Edit ──────────────────────────────────────────────────────────────────

create or replace function contracts.edit_agreement_payment(
  p_payment_id       uuid,
  p_amount           numeric,
  p_reason           text,
  p_method           public.payment_method,
  p_bank_name        text,
  p_bank_number      text,
  p_bank_holder_name text,
  p_change_note      text)
returns int
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me        uuid := contracts._me();
  p           contracts.payments%rowtype;
  a           contracts.agreements%rowtype;
  v_reason    text;
  v_note      text;
  v_bank      boolean := p_method = 'bank';
  v_bank_name text;
  v_bank_no   text;
  v_holder    text;
  v_approved  numeric;
  v_last      contracts.payment_versions%rowtype;
begin
  select * into p from contracts.payments where id = p_payment_id;
  if not found then
    raise exception 'الدفعة غير موجودة' using errcode = 'P0002';
  end if;
  if p.agreement_id is null then
    raise exception 'لا يمكن تعديل هذه الدفعة' using errcode = '22023';
  end if;

  -- Agreement first, then the payment: the same order create takes, so
  -- an edit and a new payment on one agreement serialise, never deadlock.
  select * into a from contracts.agreements where id = p.agreement_id for update;
  select * into p from contracts.payments where id = p_payment_id for update;

  if p.status <> 'pending' then
    raise exception 'لا يمكن تعديل دفعة بعد قبولها أو رفضها' using errcode = '22023';
  end if;
  if not (public.can_i('view_all_project_agreements', a.project_id)
          or (p.created_by = v_me and public.can_i('view_project_agreements', a.project_id))) then
    raise exception 'ليس لديك صلاحية تعديل هذه الدفعة' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'المبلغ يجب أن يكون أكبر من صفر' using errcode = '22023';
  end if;
  v_reason := contracts._text(p_reason, 'سبب الدفعة', 15, 300);
  if p_method is null then
    raise exception 'اختر طريقة الدفع' using errcode = '22023';
  end if;
  if v_bank and (coalesce(btrim(p_bank_name), '') = ''
                 or coalesce(btrim(p_bank_number), '') = ''
                 or coalesce(btrim(p_bank_holder_name), '') = '') then
    raise exception 'أكمل بيانات الحساب البنكي' using errcode = '22023';
  end if;
  v_note := contracts._text(p_change_note, 'سبب التعديل', 5, 300);
  v_bank_name := case when v_bank then btrim(p_bank_name) end;
  v_bank_no   := case when v_bank then btrim(p_bank_number) end;
  v_holder    := case when v_bank then btrim(p_bank_holder_name) end;

  -- Only approved payments count: this one is the agreement's single
  -- pending payment, so its own old amount is left out.
  select coalesce(sum(amount), 0) into v_approved
    from contracts.payments
   where agreement_id = a.id and status = 'approved';

  if p_amount > a.total - a.opening_paid - v_approved then
    raise exception 'المبلغ أكبر من المتبقي في الاتفاقية (%)', a.total - a.opening_paid - v_approved
      using errcode = '22023';
  end if;
  if p.penalty_amount > p_amount then
    raise exception 'الغرامات المخصومة من هذه الدفعة (%) أكبر من المبلغ', p.penalty_amount
      using errcode = '22023';
  end if;

  if p_amount = p.amount
     and v_reason is not distinct from p.payments_reason
     and p_method = p.method
     and v_bank_name is not distinct from p.bank_name
     and v_bank_no is not distinct from p.bank_number
     and v_holder is not distinct from p.bank_holder_name then
    raise exception 'لا توجد تغييرات للحفظ' using errcode = '22023';
  end if;

  -- Who wrote the version being replaced: the last editor, else the creator.
  select * into v_last
    from contracts.payment_versions
   where payment_id = p.id
   order by version_no desc
   limit 1;

  insert into contracts.payment_versions (
    payment_id, version_no, amount, penalty_amount, penalty_reason,
    payments_reason, method, bank_name, bank_number, bank_holder_name,
    created_by, created_at, change_note, edited_by)
  values (
    p.id, p.edit_count + 1, p.amount, p.penalty_amount, p.penalty_reason,
    p.payments_reason, p.method, p.bank_name, p.bank_number, p.bank_holder_name,
    coalesce(v_last.edited_by, p.created_by), coalesce(v_last.edited_at, p.created_at),
    v_note, v_me);

  -- grand_total is generated (amount - penalty_amount).
  update contracts.payments
     set amount           = p_amount,
         payments_reason  = v_reason,
         method           = p_method,
         bank_name        = v_bank_name,
         bank_number      = v_bank_no,
         bank_holder_name = v_holder,
         edit_count       = p.edit_count + 1,
         updated_at       = now()
   where id = p.id;

  return p.edit_count + 1;
end $function$;

revoke all on function contracts.edit_agreement_payment(uuid, numeric, text, public.payment_method, text, text, text, text) from public, anon;
grant execute on function contracts.edit_agreement_payment(uuid, numeric, text, public.payment_method, text, text, text, text) to authenticated;

-- ─── History ───────────────────────────────────────────────────────────────

-- Everything the edit screen and the history lists need about one
-- payment: its old versions, whether I may edit it, and the most it may
-- be (worked out here so the apps never add money up themselves).
create or replace function contracts.payment_history(p_payment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select case when auth.uid() is null or public.sec_is_company() then (
    select jsonb_build_object(
             'edit_count', p.edit_count,
             'can_edit',
               p.status = 'pending'
               and a.id is not null
               and auth.uid() is not null
               and (public.can_i('view_all_project_agreements', a.project_id)
                    or (p.created_by = auth.uid()
                        and public.can_i('view_project_agreements', a.project_id))),
             'max_amount',
               case when a.id is not null then
                 a.total - a.opening_paid - coalesce((
                   select sum(x.amount) from contracts.payments x
                    where x.agreement_id = a.id and x.status = 'approved'), 0)
               end,
             'versions', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'version_no',       v.version_no,
                        'amount',           v.amount,
                        'penalty_amount',   v.penalty_amount,
                        'net',              v.amount - v.penalty_amount,
                        'penalty_reason',   v.penalty_reason,
                        'payments_reason',  v.payments_reason,
                        'method',           v.method,
                        'bank_name',        v.bank_name,
                        'bank_number',      v.bank_number,
                        'bank_holder_name', v.bank_holder_name,
                        'created_by_name',  contracts._person_name(c.first_name, c.last_name),
                        'created_at',       v.created_at,
                        'change_note',      v.change_note,
                        'edited_by_name',   contracts._person_name(e.first_name, e.last_name),
                        'edited_at',        v.edited_at)
                      order by v.version_no)
                 from contracts.payment_versions v
                 left join public.employees c on c.id = v.created_by
                 left join public.employees e on e.id = v.edited_by
                where v.payment_id = p.id), '[]'::jsonb))
      from contracts.payments p
      left join contracts.agreements a on a.id = p.agreement_id
     where p.id = p_payment_id
  ) end;
$function$;

revoke all on function contracts.payment_history(uuid) from public, anon;
grant execute on function contracts.payment_history(uuid) to authenticated;

-- ─── agreement_detail: + edit_count, updated_at on each payment ────────────
-- Same function as before; the only change is the two extra keys.

create or replace function contracts.agreement_detail(p_agreement_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select case when auth.uid() is null or public.sec_is_company() then (
select jsonb_build_object(
    'agreement', (
      select jsonb_build_object(
               'id',               a.id,
               'project_id',       a.project_id,
               'project_name',     pr.name,
               'contractor_id',    a.contractor_id,
               'contractor_name',  contracts._person_name(c.first_name, c.last_name),
               'title',            a.title,
               'description',      a.description,
               'note',             a.note,
               'total',            a.total,
               'current_version',  a.current_version,
               'opening_paid',     a.opening_paid,
               'opening_payments', a.opening_payments,
               'paid',             a.opening_paid + coalesce(p.approved, 0),
               'pending',          coalesce(p.pending, 0),
               'has_pending',      coalesce(p.pending_count, 0) > 0,
               'remaining',        a.total - a.opening_paid - coalesce(p.approved, 0) - coalesce(p.pending, 0),
               'created_by',       a.created_by,
               'created_by_name',  contracts._person_name(e.first_name, e.last_name),
               'created_at',       a.created_at,
               'updated_at',       a.updated_at)
        from contracts.agreements a
        join public.contractors c on c.id = a.contractor_id
        join public.projects pr on pr.id = a.project_id
        left join public.employees e on e.id = a.created_by
        left join lateral (
          select sum(amount) filter (where status = 'approved') as approved,
                 sum(amount) filter (where status = 'pending')  as pending,
                 count(*) filter (where status = 'pending')     as pending_count
            from contracts.payments
           where agreement_id = a.id
        ) p on true
       where a.id = p_agreement_id),
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'version_no',       v.version_no,
               'title',            v.title,
               'description',      v.description,
               'note',             v.note,
               'total',            v.total,
               'change_note',      v.change_note,
               'created_by_name',  contracts._person_name(e.first_name, e.last_name),
               'created_at',       v.created_at)
             order by v.version_no)
        from contracts.agreement_versions v
        left join public.employees e on e.id = v.created_by
       where v.agreement_id = p_agreement_id), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',                  i.id,
               'description',         i.description,
               'note',                i.note,
               'quantity',            i.quantity,
               'unit_id',             i.unit_id,
               'unit_name',           u.name,
               'unit_price',          coalesce(i.unit_price, i.price),
               'price',               i.price,
               'sort_order',          i.sort_order,
               'added_in_version',    i.added_in_version,
               'removed_in_version',  i.removed_in_version,
               'replaces_item_id',    i.replaces_item_id)
             order by i.sort_order, i.added_in_version)
        from contracts.agreement_items i
        left join lookups.units u on u.id = i.unit_id
       where i.agreement_id = p_agreement_id), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',               p.id,
               'payments_number',  p.payments_number,
               'amount',           p.amount,
               'prev_amount',      p.prev_amount,
               'penalty_amount',   p.penalty_amount,
               'penalty_reason',   p.penalty_reason,
               'grand_total',      p.grand_total,
               'payments_reason',  p.payments_reason,
               'method',           p.method,
               'bank_name',        p.bank_name,
               'bank_number',      p.bank_number,
               'bank_holder_name', p.bank_holder_name,
               'status',           p.status,
               'created_by',       p.created_by,
               'created_by_name',  contracts._person_name(e.first_name, e.last_name),
               'created_at',       p.created_at,
               'edit_count',       p.edit_count,
               'updated_at',       p.updated_at)
             order by p.created_at desc)
        from contracts.payments p
        left join public.employees e on e.id = p.created_by
       where p.agreement_id = p_agreement_id), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',               att.id,
               'file_path',        att.file_path,
               'file_name',        att.file_name,
               'mime_type',        att.mime_type,
               'created_at',       att.created_at,
               'uploaded_by_name', contracts._person_name(u.first_name, u.last_name))
             order by att.created_at)
        from public.attachments att
        left join public.users u on u.id = att.uploaded_by
       where att.entity_type = 'agreement' and att.entity_id = p_agreement_id), '[]'::jsonb))
  where exists (select 1 from contracts.agreements where id = p_agreement_id)
  ) end;
$function$;
