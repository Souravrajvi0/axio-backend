-- ============================================
-- SpendGuard - Final Personal DB Schema
-- Single-user | No Auth | No RLS
-- Run ONCE
-- ============================================

-- Enable UUID support
create extension if not exists "pgcrypto";

-- ============================================
-- 1. Categories
-- ============================================
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('expense', 'income')),
  icon text,
  color text,
  created_at timestamptz default now()
);

-- ============================================
-- 2. Accounts
-- ============================================
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (
    type in ('bank', 'card', 'cash', 'upi', 'wallet', 'other')
  ),
  created_at timestamptz default now()
);

-- ============================================
-- 3. Transactions (CORE)
-- ============================================
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),

  amount numeric(12,2) not null check (amount >= 0),
  type text not null check (type in ('expense', 'income')),

  category_id uuid not null
    references categories(id)
    on delete restrict,

  account_id uuid
    references accounts(id)
    on delete set null,

  merchant_name text not null
    check (char_length(trim(merchant_name)) > 0),

  transaction_date date not null,
  transaction_time time,

  notes text,
  source text default 'manual', -- manual | email | sms

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- 4. Tags
-- ============================================
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

-- ============================================
-- 5. Transaction Tags (Many-to-Many)
-- ============================================
create table if not exists transaction_tags (
  transaction_id uuid references transactions(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (transaction_id, tag_id)
);

-- ============================================
-- 6. Indexes (Performance)
-- ============================================
create index if not exists idx_transactions_date
on transactions(transaction_date desc);

create index if not exists idx_transactions_category
on transactions(category_id);

create index if not exists idx_transactions_account
on transactions(account_id);

create index if not exists idx_transactions_type
on transactions(type);

create index if not exists idx_transactions_merchant
on transactions(merchant_name);

create index if not exists idx_transactions_type_date
on transactions(type, transaction_date desc);

create index if not exists idx_transaction_tags_transaction
on transaction_tags(transaction_id);

create index if not exists idx_transaction_tags_tag
on transaction_tags(tag_id);

create index if not exists idx_categories_type
on categories(type);

-- ============================================
-- 7. Auto-update updated_at trigger
-- ============================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_transactions_updated_at on transactions;
create trigger update_transactions_updated_at
before update on transactions
for each row execute function update_updated_at_column();

-- ============================================
-- 8. Default Seed Data
-- ============================================

insert into categories (name, type, icon, color) values
  ('Food & Drinks', 'expense', 'Utensils', '#EC4899'),
  ('Groceries', 'expense', 'ShoppingBag', '#22C55E'),
  ('Rent', 'expense', 'Home', '#EF4444'),
  ('Transport', 'expense', 'Car', '#3B82F6'),
  ('Shopping', 'expense', 'ShoppingBag', '#06B6D4'),
  ('Bills', 'expense', 'Receipt', '#22C55E'),
  ('Entertainment', 'expense', 'Film', '#8B5CF6'),
  ('Health', 'expense', 'Heart', '#EF4444'),
  ('Mobile', 'expense', 'Smartphone', '#EF4444'),
  ('Clothes', 'expense', 'Shirt', '#8B5CF6'),
  ('Travel', 'expense', 'Plane', '#3B82F6'),
  ('Fuel', 'expense', 'Fuel', '#F59E0B'),
  ('Other', 'expense', 'MoreHorizontal', '#9CA3AF'),
  ('Salary', 'income', 'Wallet', '#22C55E'),
  ('Business', 'income', 'Building2', '#3B82F6'),
  ('Investment', 'income', 'TrendingUp', '#06B6D4'),
  ('Interest', 'income', 'TrendingUp', '#F59E0B'),
  ('Rewards', 'income', 'Gift', '#22C55E'),
  ('Refund', 'income', 'Repeat', '#F97316')
on conflict do nothing;

insert into accounts (name, type) values
  ('Cash', 'cash'),
  ('UPI', 'upi'),
  ('Primary Bank', 'bank')
on conflict (name) do nothing;

insert into tags (name) values
  ('Online'),
  ('Offline'),
  ('Office'),
  ('Family'),
  ('Friends'),
  ('School')
on conflict (name) do nothing;

-- ============================================
-- END OF SCHEMA
-- ============================================

