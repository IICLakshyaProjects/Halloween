-- Apply after 0004_winner_positions.sql. Keeps every existing winner and position.
begin;

alter table winners drop constraint winners_pkey;
alter table winners add primary key (contest_id, attempt_id);
create index if not exists winners_contest_position on winners (contest_id, position, selected_at, attempt_id);

create or replace function select_ranked_winner(p_contest uuid, p_attempt uuid, p_admin text, p_position integer) returns jsonb
language plpgsql as $$
declare a attempts; pens int; prior jsonb;
begin
  if p_position is null or p_position not between 1 and 1000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_position');
  end if;
  -- Serialize position edits while allowing any number of winners at the same position.
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
  select coalesce(jsonb_agg(jsonb_build_object('position', position, 'attemptId', attempt_id) order by position, selected_at, attempt_id), '[]'::jsonb)
    into prior from winners where contest_id = p_contest;
  -- Change only this drawing's position. Other winners at either position are preserved.
  insert into winners (contest_id, position, attempt_id, selected_by)
    values (p_contest, p_position, p_attempt, p_admin)
    on conflict (contest_id, attempt_id) do update
      set position = excluded.position, selected_by = excluded.selected_by, selected_at = now();
  insert into audit_events (admin_id, action, record_type, record_id, prior_value, new_value)
    values (p_admin, 'select_winner', 'contest', p_contest::text, prior,
      jsonb_build_object('position', p_position, 'attemptId', p_attempt));
  return jsonb_build_object('ok', true, 'position', p_position);
end $$;

commit;
