-- Apply after 0003_reattempt_entries.sql. Existing winners become position 1.
begin;

alter table winners add column if not exists position integer not null default 1
  check (position between 1 and 1000);
alter table winners drop constraint winners_pkey;
alter table winners add primary key (contest_id, position);

create or replace function select_ranked_winner(p_contest uuid, p_attempt uuid, p_admin text, p_position integer) returns jsonb
language plpgsql as $$
declare a attempts; pens int; prior jsonb;
begin
  if p_position is null or p_position not between 1 and 1000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_position');
  end if;
  -- Serialize changes to this contest's whole podium, including moves and replacements.
  perform 1 from contests where id = p_contest for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  select * into a from attempts where id = p_attempt and contest_id = p_contest for share;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  select stroke_count into pens from drawings where attempt_id = p_attempt;
  if a.state not in ('submitted', 'expired') or coalesce(pens, 0) = 0 then
    return jsonb_build_object('ok', false, 'code', 'ineligible');
  end if;
  if exists (select 1 from winners where contest_id = p_contest and position = p_position and attempt_id = p_attempt) then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('position', position, 'attemptId', attempt_id) order by position), '[]'::jsonb)
    into prior from winners where contest_id = p_contest;
  -- Each position has one winner; moving a drawing clears its previous position.
  delete from winners where contest_id = p_contest and (attempt_id = p_attempt or position = p_position);
  insert into winners (contest_id, position, attempt_id, selected_by)
    values (p_contest, p_position, p_attempt, p_admin);
  insert into audit_events (admin_id, action, record_type, record_id, prior_value, new_value)
    values (p_admin, 'select_winner', 'contest', p_contest::text, prior,
      jsonb_build_object('position', p_position, 'attemptId', p_attempt));
  return jsonb_build_object('ok', true, 'position', p_position);
end $$;

-- Preserve compatibility with existing callers that select a single first-place winner.
create or replace function select_winner(p_contest uuid, p_attempt uuid, p_admin text) returns jsonb
language sql as $$
  select select_ranked_winner(p_contest, p_attempt, p_admin, 1);
$$;

commit;
