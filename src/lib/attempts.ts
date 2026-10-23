import "server-only";
import { getContest, queryOne, rpc } from "./db";
import type { EmployeeSession } from "./session";

export type OwnedAttempt = {
  id: string;
  state: string;
  is_test: boolean;
  started_at: string;
  deadline_at: string;
  last_revision: number;
  entry_ref: string;
  finalized_at: string | null;
  completion_method: string | null;
};

/** The participant's current attempt, only if this session owns it. Finalizes it first if overdue. */
export async function ownedCurrentAttempt(sess: EmployeeSession): Promise<OwnedAttempt | null> {
  const contest = await getContest();
  const load = () =>
    queryOne<OwnedAttempt>(
      `select id, state, is_test, started_at, deadline_at, last_revision, entry_ref, finalized_at, completion_method
       from attempts where participant_id = $1 and contest_id = $2 and session_id = $3
       order by attempt_number desc limit 1`,
      [sess.participantId, contest.id, sess.sessionId],
    );
  let data = await load();
  if (data && data.state === "in_progress" && new Date(data.deadline_at) <= new Date()) {
    await rpc("finalize_due_attempts($1)", [data.id]);
    data = await load();
  }
  return data;
}
