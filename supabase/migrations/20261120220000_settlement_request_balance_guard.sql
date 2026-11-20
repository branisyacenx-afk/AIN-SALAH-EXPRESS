grant select,insert,update on public.settlement_requests to authenticated;
create or replace function public.validate_settlement_request()
returns trigger language plpgsql security definer set search_path=''
as $$
declare available_balance bigint;
begin
  if new.status <> 'requested' or new.reviewed_by is not null or new.reviewed_at is not null or new.paid_at is not null then
    raise exception 'new settlement requests must start in requested state';
  end if;
  if new.entity_type='driver' then
    select coalesce(sum(case when direction='credit' then amount_dzd else -amount_dzd end),0)
      into available_balance from public.financial_ledger
      where entity_user_id=new.entity_user_id and status='posted';
  else
    select coalesce(sum(case when direction='credit' then amount_dzd else -amount_dzd end),0)
      into available_balance from public.financial_ledger
      where store_id=new.store_id and status='posted';
  end if;
  if new.amount_dzd > greatest(available_balance,0) then
    raise exception 'requested amount exceeds available posted balance';
  end if;
  if exists(select 1 from public.settlement_requests r where r.entity_type=new.entity_type
    and coalesce(r.entity_user_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(new.entity_user_id,'00000000-0000-0000-0000-000000000000'::uuid)
    and coalesce(r.store_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(new.store_id,'00000000-0000-0000-0000-000000000000'::uuid)
    and r.status in ('requested','approved')) then
    raise exception 'an open settlement request already exists';
  end if;
  return new;
end $$;
revoke all on function public.validate_settlement_request() from public,anon,authenticated;
drop trigger if exists settlement_request_guard on public.settlement_requests;
create trigger settlement_request_guard before insert on public.settlement_requests
for each row execute function public.validate_settlement_request();