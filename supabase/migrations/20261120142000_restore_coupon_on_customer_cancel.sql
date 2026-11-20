CREATE OR REPLACE FUNCTION public.customer_cancel_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_order public.orders%rowtype;
  v_item record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and customer_id = auth.uid()
  for update;

  if not found or v_order.status <> 'pending' then
    raise exception 'لا يمكن إلغاء الطلب بعد أن يبدأ المتجر في معالجته. تواصل مع الدعم.';
  end if;

  update public.orders
  set status = 'cancelled', updated_at = now()
  where id = p_order_id;

  for v_item in
    select (x->>'product_id')::bigint as product_id,
           sum((x->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(v_order.items) x
    group by (x->>'product_id')::bigint
  loop
    update public.products
    set stock_quantity = stock_quantity + v_item.quantity, updated_at = now()
    where id = v_item.product_id and stock_quantity is not null;
  end loop;

  if v_order.coupon_code is not null then
    update public.coupons
    set used_count = greatest(0, used_count - 1)
    where upper(code) = upper(v_order.coupon_code);
  end if;

  insert into public.order_status_history(order_id, old_status, new_status, changed_by, note)
  values (p_order_id, v_order.status, 'cancelled', auth.uid(),
          'Cancelled by customer before merchant acceptance; finite stock and coupon usage restored');

  if v_order.store_id is not null then
    insert into public.notifications(user_id, title, body, kind, data)
    select s.owner_id, 'تم إلغاء الطلب', 'قام الزبون بإلغاء الطلب قبل بدء التحضير.',
           'order', jsonb_build_object('order_id', p_order_id, 'status', 'cancelled')
    from public.stores s
    where s.id = v_order.store_id and s.owner_id is not null;
  end if;
end;
$function$;