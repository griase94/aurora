/**
 * What a handler is: the rules of one command family. A handler returns the
 * new state and the audit events of the change; `apply` appends the events to
 * the trail, so no handler can forget it (rule 10).
 */
import type {
  Actor,
  ApplyContext,
  AuditEvent,
  Command,
  Instant,
  Refusal,
  StampResult,
  WorldState,
} from "./types.ts";

export interface HandlerContext extends ApplyContext {
  /** `ctx.now`, truncated to its minute (rule 2). */
  readonly now: Instant;
  /** An audit event of this command, with its id, time, actor and origin filled in. */
  event(
    e: Omit<AuditEvent, "id" | "at" | "actor" | "origin"> &
      Partial<Pick<AuditEvent, "origin">>,
  ): AuditEvent;
}

export type HandlerOutcome =
  | {
      ok: true;
      /** The new state; its `audit` is left as it was: `apply` appends `events`. */
      state: WorldState;
      events: AuditEvent[];
      result?: StampResult | { id: string };
    }
  | { ok: false; refusal: Refusal };

export type Handler<C extends Command> = (
  state: WorldState,
  command: C,
  ctx: HandlerContext,
) => HandlerOutcome;

/** A refusal as a handler outcome. */
export const refuse = (
  code: Refusal["code"],
  field?: string,
  detail?: Refusal["detail"],
): HandlerOutcome => ({
  ok: false,
  refusal: { code, ...(field ? { field } : {}), ...(detail ? { detail } : {}) },
});

/**
 * The body of a family whose lane has not run yet: it refuses every command
 * with `invalid` and `detail.reason: "not built"`. The family's lane replaces
 * the body of its own file and edits nothing else.
 */
export function notBuilt(family: string): Handler<Command> {
  return () => refuse("invalid", undefined, { reason: "not built", family });
}

/** Which surface an actor's command came from, for the audit trail's origin. */
export function surfaceOf(actor: Actor): AuditEvent["origin"]["surface"] {
  if (actor.kind === "kiosk") return "kiosk";
  if (actor.kind === "person" && actor.role === "employee") return "phone";
  return "admin";
}
