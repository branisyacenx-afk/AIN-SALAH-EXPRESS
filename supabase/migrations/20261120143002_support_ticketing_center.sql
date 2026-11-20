create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 4 and 140),
  category text not null default 'استفسار' check (char_length(category) <= 50),
  status text not null default 'open' check (status in ('open','in_progress','answered','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer','merchant','driver','admin')),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists support_tickets_user_updated_idx on public.support_tickets(user_id, updated_at desc);
create index if not exists support_messages_ticket_created_idx on public.support_messages(ticket_id, created_at);
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
revoke all on table public.support_tickets, public.support_messages from anon, authenticated;
grant select, insert, update on table public.support_tickets to authenticated;
grant select, insert on table public.support_messages to authenticated;
create policy support_tickets_read_owner_or_admin on public.support_tickets for select to authenticated
using (user_id = (select auth.uid()) or (select auth.jwt()->'app_metadata'->>'role') = 'admin');
create policy support_tickets_create_owner on public.support_tickets for insert to authenticated
with check (user_id = (select auth.uid()));
create policy support_tickets_admin_update on public.support_tickets for update to authenticated
using ((select auth.jwt()->'app_metadata'->>'role') = 'admin')
with check ((select auth.jwt()->'app_metadata'->>'role') = 'admin');
create policy support_messages_read_participants on public.support_messages for select to authenticated
using (exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.user_id = (select auth.uid()) or (select auth.jwt()->'app_metadata'->>'role') = 'admin')));
create policy support_messages_insert_customer_or_admin on public.support_messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and (
    (sender_role in ('customer','merchant','driver')
      and exists (
        select 1 from public.support_tickets t
        where t.id = ticket_id and t.user_id = (select auth.uid()) and t.status <> 'closed'
      )
      and sender_role = coalesce((select auth.jwt()->'app_metadata'->>'role'), 'customer'))
    or (sender_role = 'admin' and (select auth.jwt()->'app_metadata'->>'role') = 'admin')
  )
);
create or replace function public.touch_support_ticket()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.support_tickets set updated_at = now() where id = new.ticket_id;
  return new;
end;
$$;
revoke all on function public.touch_support_ticket() from public, anon, authenticated;
create trigger support_message_touch_ticket after insert on public.support_messages
for each row execute function public.touch_support_ticket();
