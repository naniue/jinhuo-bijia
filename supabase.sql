-- 在 Supabase Dashboard → SQL Editor 里整段运行一次

create table if not exists public.products (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  anime text not null default '',
  kind text not null default '',
  note text not null default '',
  sale_dates jsonb not null default '[]'::jsonb,
  amiami numeric,
  sootang numeric,
  anismile numeric,
  offline numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  rate numeric not null default 0.048,
  updated_at timestamptz not null default now()
);

create index if not exists products_user_id_idx on public.products (user_id);

alter table public.products enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "own products" on public.products;
create policy "own products" on public.products
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own settings" on public.app_settings;
create policy "own settings" on public.app_settings
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', false)
on conflict (id) do nothing;

drop policy if exists "own photos select" on storage.objects;
drop policy if exists "own photos insert" on storage.objects;
drop policy if exists "own photos update" on storage.objects;
drop policy if exists "own photos delete" on storage.objects;

create policy "own photos select" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own photos insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own photos update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own photos delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-photos' and (storage.foldername(name))[1] = auth.uid()::text);
