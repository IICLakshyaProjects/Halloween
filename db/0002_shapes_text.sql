-- Run once in the Neon SQL Editor if you already ran db/schema.sql before shapes/text existed.
-- Counts shapes and text as drawing content (previously only pen strokes).

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
