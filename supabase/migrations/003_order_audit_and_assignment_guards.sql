-- Audit every order state transition and reject assignments to non-driver accounts.
create or replace function private.audit_order_status_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.status is distinct from old.status then
  insert into public.order_status_history(order_id,changed_by,old_status,new_status,note)
  values(new.id,auth.uid(),old.status,new.status,'تحديث حالة الطلب');
 end if;
 return new;
end;
$$;
revoke all on function private.audit_order_status_change() from public,anon,authenticated;
drop trigger if exists audit_order_status_change on public.orders;
create trigger audit_order_status_change after update of status on public.orders
for each row when (old.status is distinct from new.status)
execute function private.audit_order_status_change();

create or replace function private.validate_order_driver_assignment()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_role text;
begin
 if new.driver_id is not null and (tg_op='INSERT' or old.driver_id is distinct from new.driver_id) then
  select raw_app_meta_data->>'role' into v_role from auth.users where id=new.driver_id;
  if v_role is distinct from 'driver' then raise exception 'المستخدم المحدد ليس حساب سائق معتمداً'; end if;
 end if;
 return new;
end;
$$;
revoke all on function private.validate_order_driver_assignment() from public,anon,authenticated;
drop trigger if exists validate_order_driver_assignment on public.orders;
create trigger validate_order_driver_assignment before insert or update of driver_id on public.orders
for each row execute function private.validate_order_driver_assignment();

create or replace function private.update_assigned_order_status(p_order_id uuid,p_new_status text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_old text;
begin
 if v_uid is null or (select auth.jwt()->'app_metadata'->>'role')<>'driver' then raise exception 'Driver access required';end if;
 if p_new_status not in('picked_up','on_the_way','delivered') then raise exception 'Invalid status';end if;
 select status into v_old from public.orders where id=p_order_id and driver_id=v_uid for update;
 if not found then raise exception 'Order not assigned to this driver';end if;
 if not((v_old='assigned' and p_new_status='picked_up')or(v_old='picked_up' and p_new_status='on_the_way')or(v_old='on_the_way' and p_new_status='delivered')) then raise exception 'Invalid order status transition';end if;
 update public.orders set status=p_new_status,updated_at=now(),delivered_at=case when p_new_status='delivered' then now() else delivered_at end where id=p_order_id;
end;
$$;
revoke all on function private.update_assigned_order_status(uuid,text) from public,anon,authenticated;
grant execute on function private.update_assigned_order_status(uuid,text) to authenticated;
create or replace function public.update_assigned_order_status(p_order_id uuid,p_new_status text)
returns void language sql security invoker set search_path='' as $$select private.update_assigned_order_status(p_order_id,p_new_status);$$;
revoke all on function public.update_assigned_order_status(uuid,text) from public,anon;
grant execute on function public.update_assigned_order_status(uuid,text) to authenticated;

revoke update on public.profiles from authenticated;
grant update(full_name,phone) on public.profiles to authenticated;

do $$
begin
 if not exists(select 1 from pg_constraint where conname='orders_latitude_range') then
  alter table public.orders add constraint orders_latitude_range check(latitude is null or latitude between -90 and 90);
 end if;
 if not exists(select 1 from pg_constraint where conname='orders_longitude_range') then
  alter table public.orders add constraint orders_longitude_range check(longitude is null or longitude between -180 and 180);
 end if;
end $$;
