create or replace function private.place_order(
 p_customer_phone text,p_delivery_address text,p_latitude double precision,p_longitude double precision,p_notes text,p_items jsonb
) returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
 v_uid uuid:=auth.uid(); v_order_id uuid; v_subtotal integer; v_snapshot jsonb; v_store_id uuid; v_store_count integer;
 v_store_lat double precision; v_store_lng double precision; v_base_fee integer:=150; v_per_km integer:=0;
 v_commission_pct numeric:=0; v_delivery_distance numeric(8,2); v_delivery_fee integer:=150; v_commission integer:=0;
begin
 if v_uid is null then raise exception 'يجب تسجيل الدخول لإرسال الطلب'; end if;
 if coalesce(length(trim(p_customer_phone)),0)<8 then raise exception 'رقم الهاتف غير صالح'; end if;
 if coalesce(length(trim(p_delivery_address)),0)<5 then raise exception 'عنوان التوصيل مطلوب'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>30 then raise exception 'السلة غير صالحة'; end if;
 with requested as(select (x->>'product_id')::bigint product_id,(x->>'quantity')::integer quantity from jsonb_array_elements(p_items)x)
 select sum(p.price_dzd*r.quantity)::integer,
 jsonb_agg(jsonb_build_object('product_id',p.id,'name',p.name,'unit_price',p.price_dzd,'quantity',r.quantity,'store_id',p.store_id)),
 (array_agg(p.store_id))[1],count(distinct coalesce(p.store_id,'00000000-0000-0000-0000-000000000000'::uuid))
 into v_subtotal,v_snapshot,v_store_id,v_store_count
 from requested r join public.products p on p.id=r.product_id and p.is_available where r.quantity between 1 and 20;
 if v_subtotal is null or jsonb_array_length(v_snapshot)<>jsonb_array_length(p_items) then raise exception 'بعض المنتجات غير متوفرة أو الكمية غير صحيحة'; end if;
 if v_store_count<>1 then raise exception 'يرجى إنشاء طلب منفصل لكل مطعم أو متجر'; end if;
 if v_subtotal>2000000 then raise exception 'قيمة الطلب تتجاوز الحد المسموح'; end if;
 select coalesce(amount_dzd,150) into v_base_fee from public.pricing_rules where rule_key='base_delivery_fee' and is_active;
 select coalesce(amount_dzd,0) into v_per_km from public.pricing_rules where rule_key='per_km_fee' and is_active;
 select coalesce(percentage,0) into v_commission_pct from public.pricing_rules where rule_key='platform_commission' and is_active;
 select latitude,longitude into v_store_lat,v_store_lng from public.stores where id=v_store_id;
 if p_latitude is not null and p_longitude is not null and v_store_lat is not null and v_store_lng is not null then
  v_delivery_distance:=round((6371*acos(least(1::double precision,greatest(-1::double precision,
   sin(radians(v_store_lat))*sin(radians(p_latitude))+cos(radians(v_store_lat))*cos(radians(p_latitude))*cos(radians(p_longitude-v_store_lng))
  ))))::numeric,2);
 end if;
 v_delivery_fee:=greatest(0,v_base_fee)+case when v_delivery_distance is not null then ceil(v_delivery_distance*greatest(0,v_per_km))::integer else 0 end;
 v_commission:=greatest(0,least(v_subtotal,round(v_subtotal*greatest(0,least(100,v_commission_pct))/100)::integer));
 insert into public.orders(customer_id,store_id,customer_phone,delivery_address,latitude,longitude,notes,items,subtotal_dzd,delivery_fee_dzd,delivery_distance_km,platform_commission_dzd)
 values(v_uid,v_store_id,trim(p_customer_phone),trim(p_delivery_address),p_latitude,p_longitude,coalesce(p_notes,''),v_snapshot,v_subtotal,v_delivery_fee,v_delivery_distance,v_commission)
 returning id into v_order_id;
 insert into public.order_status_history(order_id,changed_by,new_status,note) values(v_order_id,v_uid,'pending','تم استلام الطلب');
 if v_store_id is not null then
  insert into public.notifications(user_id,title,body,kind,data)
  select s.owner_id,'طلب جديد','لديك طلب جديد بانتظار التأكيد.','order',jsonb_build_object('order_id',v_order_id)
  from public.stores s where s.id=v_store_id and s.owner_id is not null;
 end if;
 return v_order_id;
end;
$function$;
