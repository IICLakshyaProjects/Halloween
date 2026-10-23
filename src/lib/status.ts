import "server-only";
import { ATTEMPT_SECONDS } from "./constants";
import { getContest, query, rpc, type Contest } from "./db";
import type { EmployeeSession } from "./session";
import { formatInZone } from "./time";

export const START_MESSAGES: Record<string, string> = {
  closed: "Entries are currently closed.",
  not_open: "The contest has not opened yet.",
  too_late: "It is too late to start: a full 15-minute attempt no longer fits before the contest closes.",
  already_used: "An attempt has already been used for this employee ID. Please contact the organizer if you need help.",
  active_exists: "An attempt for this employee ID is already in progress.",
  conflict: "Another request is already starting an attempt for this employee ID.",
  no_contest: "The contest is not configured yet.",
};

export function lastStartAt(c: Contest): string | null {
  return c.closes_at ? new Date(new Date(c.closes_at).getTime() - ATTEMPT_SECONDS * 1000).toISOString() : null;
}

/** Why a new attempt cannot start right now for reasons that do not depend on the participant. */
export function contestBlock(c: Contest, now = new Date()): string | null {
  if (!c.entry_open) return "closed";
  if (c.opens_at && now < new Date(c.opens_at)) return "not_open";
  if (c.closes_at && now.getTime() + ATTEMPT_SECONDS * 1000 > new Date(c.closes_at).getTime()) return "too_late";
  return null;
}

type AttemptRow = {
  id: string;
  session_id: string;
  attempt_number: number;
  is_test: boolean;
  state: string;
  entry_ref: string;
  started_at: string;
  deadline_at: string;
  finalized_at: string | null;
  completion_method: string | null;
};

export async function employeeStatus(sess: EmployeeSession) {
  const contest = await getContest();

  // Lazily finalize this participant's overdue attempt (the scheduler does the same for everyone).
  const load = () =>
    query<AttemptRow>(
      `select id, session_id, attempt_number, is_test, state, entry_ref, started_at, deadline_at, finalized_at, completion_method
       from attempts where participant_id = $1 and contest_id = $2 order by attempt_number desc`,
      [sess.participantId, contest.id],
    );
  let attempts = await load();
  const overdue = attempts.find((a) => a.state === "in_progress" && new Date(a.deadline_at) <= new Date());
  if (overdue) {
    await rpc("finalize_due_attempts($1)", [overdue.id]);
    attempts = await load();
  }

  const latest = attempts[0] ?? null;
  const active = attempts.find((a) => a.state === "in_progress") ?? null;
  const officialUsed = attempts.some((a) => !a.is_test);

  let attempt: Record<string, unknown> | null = null;
  if (active) {
    attempt =
      active.session_id === sess.sessionId
        ? { kind: "in_progress", deadlineAt: active.deadline_at, isTest: active.is_test }
        : {
            kind: "locked_elsewhere",
            message:
              "An attempt for this employee ID is already in progress in another browser or session. Please continue there, or contact the organizer.",
          };
  } else if (latest) {
    attempt =
      latest.session_id === sess.sessionId
        ? {
            kind: "finalized",
            entryRef: latest.entry_ref,
            state: latest.state,
            completionMethod: latest.completion_method,
            completedAt: latest.finalized_at,
            isTest: latest.is_test,
            completedAtText: formatInZone(latest.finalized_at, contest.timezone),
          }
        : {
            kind: "used_elsewhere",
            message: "An attempt has already been completed for this employee ID. Please contact the organizer if you need help.",
          };
  }

  let startBlock: string | null = null;
  if (!active) {
    startBlock = contestBlock(contest);
    if (!startBlock && !contest.allow_repeat_attempts && officialUsed) startBlock = "already_used";
  }

  return {
    participant: { name: sess.name, employeeId: sess.employeeId },
    contest: {
      title: contest.title,
      instructions: contest.instructions,
      testing: contest.allow_repeat_attempts,
      opensAtText: contest.opens_at ? formatInZone(contest.opens_at, contest.timezone) : null,
      lastStartText: contest.closes_at ? formatInZone(lastStartAt(contest), contest.timezone) : null,
      closesAtText: contest.closes_at ? formatInZone(contest.closes_at, contest.timezone) : null,
    },
    attempt,
    canStart: !active && !startBlock,
    startBlockMessage: startBlock ? START_MESSAGES[startBlock] : null,
    serverNow: new Date().toISOString(),
  };
}
