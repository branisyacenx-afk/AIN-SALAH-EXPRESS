create index if not exists customer_favorites_product_idx on public.customer_favorites(product_id);
create index if not exists financial_ledger_created_by_idx on public.financial_ledger(created_by);
create index if not exists settlement_requests_reviewed_by_idx on public.settlement_requests(reviewed_by);
create index if not exists settlement_requests_store_idx on public.settlement_requests(store_id);