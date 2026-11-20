-- Driver joining-fee snapshot and commercial contract defaults.
alter table public.driver_applications
  add column if not exists joining_fee_dzd integer not null default 0 check (joining_fee_dzd >= 0),
  add column if not exists payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','waived')),
  add column if not exists payment_reference text not null default '',
  add column if not exists paid_at timestamptz;

create or replace function public.set_driver_application_joining_fee()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare configured_fee integer;
begin
  select coalesce((value->>'amount_dzd')::integer,0)
    into configured_fee from public.platform_settings
    where key = 'driver_joining_fee' limit 1;
  new.joining_fee_dzd := greatest(coalesce(configured_fee,0),0);
  new.payment_status := 'unpaid';
  new.payment_reference := '';
  new.paid_at := null;
  return new;
end;
$$;
revoke all on function public.set_driver_application_joining_fee() from public, anon, authenticated;
drop trigger if exists driver_application_fee_snapshot on public.driver_applications;
create trigger driver_application_fee_snapshot
before insert on public.driver_applications
for each row execute function public.set_driver_application_joining_fee();

insert into public.platform_settings(key,value)
values
 ('driver_joining_fee', jsonb_build_object('amount_dzd',0)),
 ('merchant_contract_prices', jsonb_build_object('monthly',0,'six_months',0,'yearly',0,'lifetime',0))
on conflict (key) do nothing;

create index if not exists driver_applications_payment_status_idx
on public.driver_applications(payment_status,created_at desc);

-- Enforce settlement in the database too, not only in the admin interface.
create or replace function public.enforce_driver_joining_fee_before_approval()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.is_approved is true and exists (
    select 1 from public.driver_applications a
    where a.user_id = new.user_id and a.joining_fee_dzd > 0
      and a.payment_status = 'unpaid' and a.status <> 'rejected'
  ) then
    raise exception 'Driver joining fee must be marked paid or waived before approval';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_driver_joining_fee_before_approval() from public, anon, authenticated;
drop trigger if exists driver_joining_fee_approval_guard on public.driver_profiles;
create trigger driver_joining_fee_approval_guard
before insert or update of is_approved on public.driver_profiles
for each row execute function public.enforce_driver_joining_fee_before_approval();
