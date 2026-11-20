-- AIN SALAH EXPRESS: auditable financial ledger and settlement requests
create table if not exists public.financial_ledger (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('driver','merchant','platform','customer')),
  entity_user_id uuid,
  store_id uuid references public.stores(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  entry_type text not null check (entry_type in ('delivery_earning','merchant_sale','platform_commission','joining_fee','contract_fee','adjustment','refund','payout','cash_collection')),
  direction text not null check (direction in ('credit','debit')),
  amount_dzd integer not null check (amount_dzd > 0),
  status text not null default 'posted' check (status in ('pending','posted','void')),
  reference text not null default '',
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint financial_ledger_subject_check check (
    (entity_type='merchant' and store_id is not null)
    or (entity_type<>'merchant' and (entity_user_id is not null or entity_type='platform'))
  )
);
create index if not exists financial_ledger_user_date_idx on public.financial_ledger(entity_user_id,created_at desc);
create index if not exists financial_ledger_store_date_idx on public.financial_ledger(store_id,created_at desc);
create index if not exists financial_ledger_order_idx on public.financial_ledger(order_id);
alter table public.financial_ledger enable row level security;
drop policy if exists financial_ledger_admin_read on public.financial_ledger;
create policy financial_ledger_admin_read on public.financial_ledger for select to authenticated
using ((select auth.jwt()->'app_metadata'->>'role')='admin');
drop policy if exists financial_ledger_subject_read on public.financial_ledger;
create policy financial_ledger_subject_read on public.financial_ledger for select to authenticated
using (
  (entity_user_id=(select auth.uid()))
  or (entity_type='merchant' and exists(select 1 from public.stores s where s.id=financial_ledger.store_id and s.owner_id=(select auth.uid())))
);
revoke insert,update,delete on public.financial_ledger from anon,authenticated;
grant select on public.financial_ledger to authenticated;

create table if not exists public.settlement_requests (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check(entity_type in ('driver','merchant')),
  entity_user_id uuid,
  store_id uuid references public.stores(id) on delete restrict,
  amount_dzd integer not null check(amount_dzd>0),
  status text not null default 'requested' check(status in ('requested','approved','paid','rejected')),
  payment_method text not null default 'cash' check(payment_method in ('cash','bank_transfer','baridimob','other')),
  payment_reference text not null default '',
  requester_note text not null default '',
  admin_note text not null default '',
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  constraint settlement_subject_check check(
    (entity_type='driver' and entity_user_id is not null and store_id is null)
    or (entity_type='merchant' and store_id is not null)
  )
);
create index if not exists settlement_requests_status_date_idx on public.settlement_requests(status,requested_at desc);
alter table public.settlement_requests enable row level security;
drop policy if exists settlement_admin_all on public.settlement_requests;
create policy settlement_admin_all on public.settlement_requests for all to authenticated
using ((select auth.jwt()->'app_metadata'->>'role')='admin')
with check ((select auth.jwt()->'app_metadata'->>'role')='admin');
drop policy if exists settlement_owner_read on public.settlement_requests;
create policy settlement_owner_read on public.settlement_requests for select to authenticated
using ((entity_user_id=(select auth.uid())) or (entity_type='merchant' and exists(select 1 from public.stores s where s.id=settlement_requests.store_id and s.owner_id=(select auth.uid()))));
drop policy if exists settlement_owner_request on public.settlement_requests;
create policy settlement_owner_request on public.settlement_requests for insert to authenticated
with check (
  status='requested' and reviewed_by is null and reviewed_at is null and paid_at is null
  and ((entity_type='driver' and entity_user_id=(select auth.uid()) and (select auth.jwt()->'app_metadata'->>'role')='driver')
    or (entity_type='merchant' and exists(select 1 from public.stores s where s.id=settlement_requests.store_id and s.owner_id=(select auth.uid()) and (select auth.jwt()->'app_metadata'->>'role')='merchant')))
);

create or replace function public.admin_post_financial_entry(
  p_entity_type text, p_entity_user_id uuid, p_store_id uuid, p_order_id uuid,
  p_entry_type text, p_direction text, p_amount_dzd integer,
  p_reference text default '', p_notes text default ''
) returns uuid language plpgsql security definer set search_path=''
as $$
declare new_id uuid;
begin
  if (select auth.jwt()->'app_metadata'->>'role') <> 'admin' then
    raise exception 'admin role required' using errcode='42501';
  end if;
  if p_amount_dzd is null or p_amount_dzd <= 0 then raise exception 'amount must be positive'; end if;
  if p_entity_type not in ('driver','merchant','platform','customer') then raise exception 'invalid entity'; end if;
  if p_direction not in ('credit','debit') then raise exception 'invalid direction'; end if;
  if p_entry_type not in ('delivery_earning','merchant_sale','platform_commission','joining_fee','contract_fee','adjustment','refund','payout','cash_collection') then raise exception 'invalid entry type'; end if;
  if p_entity_type='driver' and not exists(select 1 from public.driver_profiles d where d.user_id=p_entity_user_id) then raise exception 'driver not found'; end if;
  if p_entity_type='merchant' and not exists(select 1 from public.stores s where s.id=p_store_id) then raise exception 'store not found'; end if;
  insert into public.financial_ledger(entity_type,entity_user_id,store_id,order_id,entry_type,direction,amount_dzd,status,reference,notes,created_by)
  values(p_entity_type,p_entity_user_id,p_store_id,p_order_id,p_entry_type,p_direction,p_amount_dzd,'posted',left(coalesce(p_reference,''),160),left(coalesce(p_notes,''),1000),auth.uid())
  returning id into new_id;
  insert into public.admin_audit_log(actor_id,entity_type,entity_id,action,after_data)
  values(auth.uid(),'financial_ledger',new_id::text,'FINANCIAL_ENTRY_POSTED',jsonb_build_object('entity_type',p_entity_type,'entity_user_id',p_entity_user_id,'store_id',p_store_id,'order_id',p_order_id,'entry_type',p_entry_type,'direction',p_direction,'amount_dzd',p_amount_dzd,'reference',p_reference));
  return new_id;
end $$;
revoke all on function public.admin_post_financial_entry(text,uuid,uuid,uuid,text,text,integer,text,text) from public,anon;
grant execute on function public.admin_post_financial_entry(text,uuid,uuid,uuid,text,text,integer,text,text) to authenticated;
