-- Halloween Drawing Contest Portal — schema, constraints and atomic functions.
-- Target: Neon PostgreSQL. Run once (Neon SQL editor or `npm run db:migrate`). Only the server touches these tables via DATABASE_URL.

-- ---------------------------------------------------------------- tables

create table if not exists contests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  instructions text not null default '',
  timezone text not null default 'Asia/Kolkata',
  opens_at timestamptz,
  closes_at timestamptz,
  entry_open boolean not null default false,
  duration_seconds int not null default 900 check (duration_seconds = 900),
  allow_repeat_attempts boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null unique check (employee_id ~ '^LA-IND-[0-9]{4}$'),
  name text not null check (char_length(name) between 1 and 100),
  name_key text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id),
  contest_id uuid not null references contests(id),
  session_id uuid not null references sessions(id),
  attempt_number int not null,
  is_test boolean not null,
  state text not null default 'in_progress'
    check (state in ('in_progress', 'submitted', 'expired', 'expired_empty')),
  entry_ref text not null unique default ('HW-' || upper(substr(md5(gen_random_uuid()::text), 1, 8))),
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  finalized_at timestamptz,
  completion_method text check (completion_method in ('manual', 'automatic')),
  last_revision int not null default 0,
  editor_id text,
  editor_lease_until timestamptz,
  unique (participant_id, contest_id, attempt_number),
  check (deadline_at = started_at + interval '900 seconds')
);

-- At most one in-progress attempt, and at most one official attempt, per participant per contest.
create unique index if not exists attempts_one_active
  on attempts (participant_id, contest_id) where state = 'in_progress';
create unique index if not exists attempts_one_official
  on attempts (participant_id, contest_id) where not is_test;
create index if not exists attempts_due on attempts (deadline_at) where state = 'in_progress';
create index if not exists attempts_contest_state on attempts (contest_id, state);

create table if not exists drawings (
  attempt_id uuid primary key references attempts(id),
  width int not null default 900,
  height int not null default 1600,
  strokes jsonb not null default '[]'::jsonb,
  stroke_count int not null default 0, -- pen strokes, shapes and text (erasing, fills and moves alone do not make a drawing "non-empty")
  saved_at timestamptz not null default now(),
  preview_svg text -- cached preview rendered from saved strokes; stays private in Neon
);

create table if not exists winners (
  contest_id uuid primary key references contests(id),
  attempt_id uuid not null unique references attempts(id),
  selected_by text not null,
  selected_at timestamptz not null default now()
);

create table if not exists audit_events (
  id bigserial primary key,
  admin_id text not null,
  action text not null,
  record_type text not null,
  record_id text,
  prior_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references admins(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- ---------------------------------------------------------------- immutability guards

create or replace function guard_attempt_update() returns trigger language plpgsql as $$
begin
  if new.is_test is distinct from old.is_test
     or new.started_at is distinct from old.started_at
     or new.deadline_at is distinct from old.deadline_at
     or new.participant_id is distinct from old.participant_id
     or new.contest_id is distinct from old.contest_id
     or new.session_id is distinct from old.session_id then
    raise exception 'attempt identity, timing and classification are immutable';
  end if;
  if old.state <> 'in_progress' and (new.state is distinct from old.state
     or new.finalized_at is distinct from old.finalized_at
     or new.completion_method is distinct from old.completion_method
     or new.last_revision is distinct from old.last_revision) then
    raise exception 'finalized attempts cannot change';
  end if;
  return new;
end $$;
drop trigger if exists attempts_guard on attempts;
create trigger attempts_guard before update on attempts for each row execute function guard_attempt_update();

create or replace function guard_drawing_update() returns trigger language plpgsql as $$
begin
  if (new.strokes is distinct from old.strokes or new.stroke_count is distinct from old.stroke_count)
     and (select state from attempts where id = old.attempt_id) <> 'in_progress' then
    raise exception 'finalized drawings cannot change';
  end if;
  return new;
end $$;
drop trigger if exists drawings_guard on drawings;
create trigger drawings_guard before update on drawings for each row execute function guard_drawing_update();

-- ---------------------------------------------------------------- functions

-- Finalize in-progress attempts whose deadline has passed (one attempt, or all when null).
-- Idempotent; safe to call from cron and from every write path.
create or replace function finalize_due_attempts(p_attempt uuid default null) returns int
language plpgsql as $$
declare r record; n int := 0; pens int;
begin
  for r in
    select id, deadline_at from attempts
    where state = 'in_progress' and deadline_at <= now() and (p_attempt is null or id = p_attempt)
    for update
  loop
    select stroke_count into pens from drawings where attempt_id = r.id;
    update attempts
      set state = case when coalesce(pens, 0) > 0 then 'expired' else 'expired_empty' end,
          finalized_at = r.deadline_at,
          completion_method = 'automatic'
      where id = r.id and state = 'in_progress';
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function start_attempt(p_participant uuid, p_session uuid, p_contest uuid) returns jsonb
language plpgsql as $$
declare
  c contests; v_now timestamptz := now(); v_official int; v_is_test boolean; v_next int; v_id uuid;
begin
  perform 1 from participants where id = p_participant for update; -- serialise per participant
  select * into c from contests where id = p_contest;
  if not found then return jsonb_build_object('ok', false, 'code', 'no_contest'); end if;

  perform finalize_due_attempts(a.id) from attempts a
    where a.participant_id = p_participant and a.contest_id = p_contest and a.state = 'in_progress';

  if exists (select 1 from attempts where participant_id = p_participant and contest_id = p_contest and state = 'in_progress') then
    return jsonb_build_object('ok', false, 'code', 'active_exists');
  end if;
  if not c.entry_open then return jsonb_build_object('ok', false, 'code', 'closed'); end if;
  if c.opens_at is not null and v_now < c.opens_at then return jsonb_build_object('ok', false, 'code', 'not_open'); end if;
  if c.closes_at is not null and v_now + make_interval(secs => c.duration_seconds) > c.closes_at then
    return jsonb_build_object('ok', false, 'code', 'too_late');
  end if;

  select count(*) into v_official from attempts where participant_id = p_participant and contest_id = p_contest and not is_test;
  if c.allow_repeat_attempts then
    v_is_test := true;
  else
    if v_official > 0 then return jsonb_build_object('ok', false, 'code', 'already_used'); end if;
    v_is_test := false;
  end if;

  select coalesce(max(attempt_number), 0) + 1 into v_next from attempts where participant_id = p_participant and contest_id = p_contest;
  begin
    insert into attempts (participant_id, contest_id, session_id, attempt_number, is_test, started_at, deadline_at)
      values (p_participant, p_contest, p_session, v_next, v_is_test, v_now, v_now + make_interval(secs => c.duration_seconds))
      returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end;
  insert into drawings (attempt_id) values (v_id);
  return jsonb_build_object('ok', true, 'attempt_id', v_id);
end $$;

create or replace function claim_editor(p_attempt uuid, p_session uuid, p_editor text) returns jsonb
language plpgsql as $$
declare a attempts;
begin
  select * into a from attempts where id = p_attempt for update;
  if not found or a.session_id <> p_session then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if a.state = 'in_progress' and a.deadline_at <= now() then
    perform finalize_due_attempts(p_attempt);
    select * into a from attempts where id = p_attempt;
  end if;
  if a.state <> 'in_progress' then return jsonb_build_object('ok', false, 'code', 'finalized', 'state', a.state); end if;
  if a.editor_id is null or a.editor_id = p_editor or a.editor_lease_until is null or a.editor_lease_until <= now() then
    update attempts set editor_id = p_editor, editor_lease_until = now() + interval '20 seconds' where id = p_attempt;
    return jsonb_build_object('ok', true, 'last_revision', a.last_revision);
  end if;
  return jsonb_build_object('ok', false, 'code', 'editor_busy');
end $$;

-- Applies ordered drawing operations and optionally finalizes (manual submit) atomically.
-- ops: [{seq, t:'add', stroke:{...}} | {seq, t:'undo', id} | {seq, t:'clear'}]
create or replace function apply_ops(p_attempt uuid, p_session uuid, p_editor text, p_ops jsonb, p_finalize boolean)
returns jsonb language plpgsql as $$
declare
  a attempts; d drawings; op jsonb; v_strokes jsonb; rev int; v_seq int; gap boolean := false; pens int;
begin
  select * into a from attempts where id = p_attempt for update;
  if not found or a.session_id <> p_session then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;

  if a.state = 'in_progress' and a.deadline_at <= now() then
    perform finalize_due_attempts(p_attempt);
    select * into a from attempts where id = p_attempt;
  end if;
  if a.state <> 'in_progress' then
    if p_finalize and a.state = 'submitted' then
      return jsonb_build_object('ok', true, 'already', true, 'state', a.state);
    end if;
    return jsonb_build_object('ok', false, 'code', case when a.state = 'submitted' then 'finalized' else 'expired' end, 'state', a.state);
  end if;

  if a.editor_id is distinct from p_editor then
    return jsonb_build_object('ok', false, 'code', 'not_editor');
  end if;

  select * into d from drawings where attempt_id = p_attempt for update;
  v_strokes := d.strokes;
  rev := a.last_revision;

  for op in select value from jsonb_array_elements(p_ops) loop
    v_seq := (op ->> 'seq')::int;
    if v_seq <= rev then continue; end if;
    if v_seq <> rev + 1 then gap := true; exit; end if;
    if op ->> 't' = 'add' then
      if not exists (select 1 from jsonb_array_elements(v_strokes) e where e ->> 'id' = op -> 'stroke' ->> 'id') then
        v_strokes := v_strokes || jsonb_build_array(op -> 'stroke');
      end if;
    elsif op ->> 't' = 'undo' then
      select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into v_strokes
        from jsonb_array_elements(v_strokes) with ordinality t(e, ord) where e ->> 'id' <> op ->> 'id';
    elsif op ->> 't' = 'clear' then
      v_strokes := '[]'::jsonb;
    end if;
    rev := v_seq;
  end loop;

  if jsonb_array_length(v_strokes) > 2000 then return jsonb_build_object('ok', false, 'code', 'too_many_strokes'); end if;
  if pg_column_size(v_strokes) > 4000000 then return jsonb_build_object('ok', false, 'code', 'too_large'); end if;

  select count(*) into pens from jsonb_array_elements(v_strokes) e where e ->> 'tool' in ('pen', 'shape', 'text');
  update drawings set strokes = v_strokes, stroke_count = pens, saved_at = now() where attempt_id = p_attempt;
  update attempts set last_revision = rev, editor_lease_until = now() + interval '20 seconds' where id = p_attempt;

  if p_finalize then
    if gap then return jsonb_build_object('ok', false, 'code', 'gap', 'last_revision', rev); end if;
    if pens = 0 then return jsonb_build_object('ok', false, 'code', 'empty', 'last_revision', rev); end if;
    update attempts set state = 'submitted', finalized_at = now(), completion_method = 'manual' where id = p_attempt;
    return jsonb_build_object('ok', true, 'state', 'submitted', 'last_revision', rev);
  end if;
  return jsonb_build_object('ok', true, 'last_revision', rev, 'gap', gap);
end $$;

create or replace function set_repeat_testing(p_contest uuid, p_value boolean, p_admin text) returns jsonb
language plpgsql as $$
declare prior boolean;
begin
  select allow_repeat_attempts into prior from contests where id = p_contest for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'no_contest'); end if;
  if prior is distinct from p_value then
    update contests set allow_repeat_attempts = p_value, updated_at = now() where id = p_contest;
    insert into audit_events (admin_id, action, record_type, record_id, prior_value, new_value)
      values (p_admin, 'toggle_repeat_attempts', 'contest', p_contest::text, to_jsonb(prior), to_jsonb(p_value));
  end if;
  return jsonb_build_object('ok', true, 'allow_repeat_attempts', p_value);
end $$;

create or replace function select_winner(p_contest uuid, p_attempt uuid, p_admin text) returns jsonb
language plpgsql as $$
declare a attempts; pens int; prior uuid;
begin
  select * into a from attempts where id = p_attempt and contest_id = p_contest for share;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  select stroke_count into pens from drawings where attempt_id = p_attempt;
  if a.is_test or a.state not in ('submitted', 'expired') or coalesce(pens, 0) = 0 then
    return jsonb_build_object('ok', false, 'code', 'ineligible');
  end if;
  select attempt_id into prior from winners where contest_id = p_contest for update;
  if prior is not distinct from p_attempt then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  insert into winners (contest_id, attempt_id, selected_by) values (p_contest, p_attempt, p_admin)
    on conflict (contest_id) do update set attempt_id = excluded.attempt_id, selected_by = excluded.selected_by, selected_at = now();
  insert into audit_events (admin_id, action, record_type, record_id, prior_value, new_value)
    values (p_admin, 'select_winner', 'contest', p_contest::text, to_jsonb(prior), to_jsonb(p_attempt));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- seed

insert into contests (title, instructions, entry_open)
select 'Halloween Drawing Contest',
       E'Draw anything Halloween-themed freehand within 15 minutes.\nYou may use the brush, eraser, colours, undo and redo. Uploading or pasting images is not possible.\nYour timer starts when you press Start Drawing and cannot be paused, restarted or extended.\nSubmit early, or your latest saved drawing is submitted automatically when time runs out.',
       true -- open by default; admins can close entry access from /admin
where not exists (select 1 from contests);

