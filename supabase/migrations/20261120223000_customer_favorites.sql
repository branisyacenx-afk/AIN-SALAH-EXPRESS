create table if not exists public.customer_favorites (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 product_id bigint not null references public.products(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique(user_id,product_id)
);
create index if not exists customer_favorites_user_created_idx on public.customer_favorites(user_id,created_at desc);
alter table public.customer_favorites enable row level security;
drop policy if exists customer_favorites_owner_read on public.customer_favorites;
create policy customer_favorites_owner_read on public.customer_favorites for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists customer_favorites_owner_insert on public.customer_favorites;
create policy customer_favorites_owner_insert on public.customer_favorites for insert to authenticated with check(user_id=(select auth.uid()));
drop policy if exists customer_favorites_owner_delete on public.customer_favorites;
create policy customer_favorites_owner_delete on public.customer_favorites for delete to authenticated using(user_id=(select auth.uid()));
grant select,insert,delete on public.customer_favorites to authenticated;