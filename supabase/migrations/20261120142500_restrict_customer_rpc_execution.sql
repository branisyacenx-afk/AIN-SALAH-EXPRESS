REVOKE ALL ON FUNCTION public.customer_cancel_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_cancel_order(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.customer_update_delivery_location(uuid, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_update_delivery_location(uuid, double precision, double precision) TO authenticated;

REVOKE ALL ON FUNCTION public.get_order_tracking_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_tracking_details(uuid) TO authenticated;
