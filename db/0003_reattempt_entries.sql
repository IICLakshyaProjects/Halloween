-- Apply once to existing databases before deploying the updated admin panel.
-- Keeps all drawings, entry references, legacy classifications and audit history.
begin;
drop index if exists attempts_one_official;

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

  select count(*) into v_official from attempts where participant_id = p_participant and contest_id = p_contest;
  if not c.allow_repeat_attempts and v_official > 0 then
    return jsonb_build_object('ok', false, 'code', 'already_used');
  end if;
  v_is_test := false; -- Reattempts are ordinary entries; preserve legacy classification on existing rows.

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

create or replace function select_winner(p_contest uuid, p_attempt uuid, p_admin text) returns jsonb
language plpgsql as $$
declare a attempts; pens int; prior uuid;
begin
  select * into a from attempts where id = p_attempt and contest_id = p_contest for share;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  select stroke_count into pens from drawings where attempt_id = p_attempt;
  if a.state not in ('submitted', 'expired') or coalesce(pens, 0) = 0 then
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

commit;
