-- Self-serve account deletion removes the auth.users row and lets the foreign
-- keys take the rest. Every FK to auth.users cascaded except one: accepted_by
-- on friend_invites had no delete rule, so deleting anyone who had ever
-- accepted an invite failed on that constraint. The invite row itself belongs
-- to the inviter and should outlive the accepter, so it nulls instead.
alter table public.friend_invites
  drop constraint friend_invites_accepted_by_fkey,
  add constraint friend_invites_accepted_by_fkey
    foreign key (accepted_by) references auth.users(id) on delete set null;
