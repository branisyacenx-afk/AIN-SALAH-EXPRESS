create or replace function public.guard_settlement_state_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if (select auth.jwt()->'app_metadata'->>'role') <> 'admin' then
   raise exception 'admin role required' using errcode='42501';
 end if;
 if old.status='requested' and new.status not in ('approved','rejected') then
   raise exception 'requested settlement can only be approved or rejected';
 elsif old.status='approved' and new.status<>'paid' then
   raise exception 'approved settlement can only be marked paid';
 elsif old.status in ('paid','rejected') and new.status<>old.status then
   raise exception 'final settlement state cannot be changed';
 end if;
 new.reviewed_at=coalesce(new.reviewed_at,now());
 new.reviewed_by=auth.uid();
 if new.status='paid' then new.paid_at=coalesce(new.paid_at,now()); end if;
 return new;
end $$;
revoke all on function public.guard_settlement_state_change() from public,anon,authenticated;
drop trigger if exists settlement_state_change_guard on public.settlement_requests;
create trigger settlement_state_change_guard before update of status on public.settlement_requests
for each row execute function public.guard_settlement_state_change();

create or replace function public.post_settlement_payout_ledger()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if old.status='approved' and new.status='paid' then
  insert into public.financial_ledger(entity_type,entity_user_id,store_id,entry_type,direction,amount_dzd,status,reference,notes,created_by)
  values(new.entity_type,new.entity_user_id,new.store_id,'payout','debit',new.amount_dzd,'posted',
    coalesce(nullif(new.payment_reference,''),'SETTLEMENT-'||new.id::text),
    'صرف مستحقات طلب تسوية رقم '||new.id::text,auth.uid());
  insert into public.admin_audit_log(actor_id,entity_type,entity_id,action,after_data)
  values(auth.uid(),'settlement_request',new.id::text,'SETTLEMENT_PAID',jsonb_build_object('amount_dzd',new.amount_dzd,'payment_reference',new.payment_reference));
 end if;
 return new;
end $$;
revoke all on function public.post_settlement_payout_ledger() from public,anon,authenticated;
drop trigger if exists settlement_paid_ledger_entry on public.settlement_requests;
create trigger settlement_paid_ledger_entry after update of status on public.settlement_requests
for each row execute function public.post_settlement_payout_ledger();