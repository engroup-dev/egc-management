-- =====================================================================
-- Pending payments: anyone with agreement access in the project may edit
-- =====================================================================
-- 20261116000000 let a pending payment be edited by its creator or by
-- anyone with view_all_project_agreements. Widened (2026-11-16, at the
-- user's request): anyone who can open the project's agreements
-- (view_project_agreements, or view_all_project_agreements) may edit any
-- pending payment there, not only their own. Everything else is
-- unchanged — the same checks, and the old row is still kept in
-- contracts.payment_versions with who edited it.
--
-- Note: creating a payment still needs view_all_project_agreements or
-- being the agreement's creator (create_agreement_payment is untouched).
-- =====================================================================

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
  if not (public.can_i('view_project_agreements', a.project_id)
          or public.can_i('view_all_project_agreements', a.project_id)) then
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
               and (public.can_i('view_project_agreements', a.project_id)
                    or public.can_i('view_all_project_agreements', a.project_id)),
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
