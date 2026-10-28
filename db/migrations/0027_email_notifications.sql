-- Private operational data: never included in published content snapshots or audit payloads.
create table email_settings (
  id integer primary key check (id = 1),
  enabled integer not null default 0 check (enabled in (0, 1)),
  active_email text,
  pending_email text,
  token_hash text,
  token_expires_at integer,
  action_after integer not null default 0,
  sender_token text,
  sender_until integer not null default 0,
  last_test_email text,
  last_test_at text,
  confirmation_status text,
  check (enabled = 0 or active_email is not null),
  check (token_hash is null or length(token_hash) = 64)
);
insert into email_settings (id) values (1);

create table email_outbox (
  id text primary key,
  kind text not null check (kind in ('consultation', 'test')),
  consultation_id text unique references consultation_requests(id) on delete cascade,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at integer not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'accepted', 'failed', 'uncertain', 'expired')),
  attempts integer not null default 0,
  next_attempt_at integer not null default 0,
  lease_until integer not null default 0,
  first_attempt_at integer,
  recipient text,
  payload text,
  provider_id text,
  error_code text,
  accepted_at text
);
create index email_outbox_due on email_outbox(status, next_attempt_at);

-- Each reserved API attempt counts, including verification, tests, retries and ambiguous failures.
create table email_send_attempts (
  id text primary key,
  attempted_at integer not null
);
create index email_send_attempts_time on email_send_attempts(attempted_at);

-- The trigger runs in the same transaction as the consultation insert AND its existing audit batch.
-- A duplicate submission never reaches AFTER INSERT. No historical requests are backfilled.
create trigger consultation_email_outbox after insert on consultation_requests
when exists (select 1 from email_settings where id = 1 and enabled = 1 and active_email is not null)
begin
  insert into email_outbox (id, kind, consultation_id, expires_at)
  values ('consultation/' || new.id, 'consultation', new.id, unixepoch() + 72000);
end;
