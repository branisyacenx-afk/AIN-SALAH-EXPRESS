create extension if not exists pgcrypto;
create type public.app_role as enum ('customer','driver','admin');
create type public.order_status as enum ('pending','accepted','preparing','picked_up','on_the_way','delivered','cancelled');
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '',
 phone text unique,
 role public.app_role not null default 'customer',
 created_at timestamptz not null default now()
);
create table public.stores (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 category text not null,
 description text default '',
 address text default '',
 latitude double precision,
 longitude double precision,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.products (
 id uuid primary key default gen_random_uuid(),
 store_id uuid references public.stores(id) on delete cascade,
 name text not null,
 description text default '',
 price_dzd integer not null check(price_dzd >= 0),
 category text not null default 'عام',
 is_available boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.orders (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid references public.profiles(id),
 driver_id uuid references public.profiles(id),
 customer_phone text not null,
 delivery_address text not null,
 latitude double precision,
 longitude double precision,
 notes text default '',
 items jsonb not null,
 total_amount integer not null check(total_amount >= 0),
 status public.order_status not null default 'pending',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.driver_locations (
 driver_id uuid primary key references public.profiles(id) on delete cascade,
 latitude double precision not null,
 longitude double precision not null,
 updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.driver_locations enable row level security;
create policy "profiles read own" on public.profiles for select to authenticated using (auth.uid()=id);
create policy "profiles update own" on public.profiles for update to authenticated using (auth.uid()=id) with check (auth.uid()=id);
create policy "stores public read active" on public.stores for select to anon,authenticated using (is_active=true);
create policy "products public read available" on public.products for select to anon,authenticated using (is_available=true);
create policy "customer create own order" on public.orders for insert to authenticated with check (customer_id=auth.uid());
create policy "customer read own orders" on public.orders for select to authenticated using (customer_id=auth.uid());
create policy "driver read assigned orders" on public.orders for select to authenticated using (driver_id=auth.uid());
create policy "driver update assigned order" on public.orders for update to authenticated using (driver_id=auth.uid()) with check (driver_id=auth.uid());
create policy "driver manage own location" on public.driver_locations for all to authenticated using (driver_id=auth.uid()) with check (driver_id=auth.uid());
-- Admin role policies must be added only after implementing a trusted role-management flow.
-- Never assign admin privileges from the browser or trust a user-editable role field.
