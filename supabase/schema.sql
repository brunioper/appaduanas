-- VeriCIF · Supabase schema
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.

create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  supplier text,
  invoice_number text,
  declared_value numeric,
  currency text,
  overall_verdict text,
  result jsonb not null,
  context jsonb,
  extraction jsonb
);

create table if not exists public.reference_prices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  hs_code text,
  description text,
  unit text,
  low_usd numeric,
  typical_usd numeric,
  high_usd numeric,
  -- 'official' = imported reference values (preferred by the app)
  -- 'model'    = AI estimates stored from past analyses (informational)
  source text not null default 'model',
  origin_country text
);

create index if not exists reference_prices_hs_code_idx on public.reference_prices (hs_code);
create index if not exists analyses_created_at_idx on public.analyses (created_at desc);

-- The app uses the anon key server-side. These permissive policies are fine
-- for an internal single-team tool; tighten them if you ever expose the DB.
alter table public.analyses enable row level security;
alter table public.reference_prices enable row level security;

drop policy if exists "anon full access analyses" on public.analyses;
create policy "anon full access analyses" on public.analyses
  for all to anon using (true) with check (true);

drop policy if exists "anon full access reference_prices" on public.reference_prices;
create policy "anon full access reference_prices" on public.reference_prices
  for all to anon using (true) with check (true);

-- To load OFFICIAL reference values (they take priority over AI estimates):
-- insert into public.reference_prices (hs_code, description, unit, low_usd, typical_usd, high_usd, source, origin_country)
-- values ('851713', 'Smartphones', 'pcs', 80, 150, 400, 'official', 'China');
