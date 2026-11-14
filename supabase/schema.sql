-- Run this whole file in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_store_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admin_users where user_id = auth.uid()); $$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  price numeric(12,2) not null default 0 check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  image_url text default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text not null,
  address text not null,
  delivery_method text not null check (delivery_method in ('post','courier')),
  delivery_fee numeric(12,2) not null check (delivery_fee in (250,500)),
  payment_method text not null check (payment_method in ('cod','bank')),
  note text default '',
  subtotal numeric(12,2) not null,
  total numeric(12,2) not null,
  status text not null default 'New',
  payment_status text not null default 'Pending',
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  line_total numeric(12,2) not null
);

alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "admin users can read own row" on public.admin_users;
create policy "admin users can read own row" on public.admin_users
for select to authenticated using (user_id = auth.uid());

drop policy if exists "public can view active products" on public.products;
create policy "public can view active products" on public.products
for select to anon, authenticated using (active = true or public.is_store_admin());

drop policy if exists "admins manage products" on public.products;
create policy "admins manage products" on public.products
for all to authenticated using (public.is_store_admin()) with check (public.is_store_admin());

drop policy if exists "customers can place orders" on public.orders;
create policy "customers can place orders" on public.orders
for insert to anon, authenticated with check (true);

drop policy if exists "admins view and update orders" on public.orders;
create policy "admins view and update orders" on public.orders
for all to authenticated using (public.is_store_admin()) with check (public.is_store_admin());

drop policy if exists "customers can add order items" on public.order_items;
create policy "customers can add order items" on public.order_items
for insert to anon, authenticated with check (true);

drop policy if exists "admins manage order items" on public.order_items;
create policy "admins manage order items" on public.order_items
for all to authenticated using (public.is_store_admin()) with check (public.is_store_admin());

-- IMPORTANT: this starter permits anonymous order creation. Before public launch,
-- add server-side validation/rate limiting and atomic stock deduction.
