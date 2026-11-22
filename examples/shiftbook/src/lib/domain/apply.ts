/**
 * `apply` is the only way the world changes. Synchronous and pure: the same
 * state, command and context give the same outcome on every machine.
 *
 * The handler table is a closed registry: it names every command family from
 * the first day. A family whose lane has not run is a typed stub in its own
 * file; that lane replaces the stub's body and never edits this table.
 */
import { surfaceOf, type Handler, type HandlerContext } from "./handler.ts";
import { handle as confirmation } from "./handlers/confirmation.ts";
import { handle as conflict } from "./handlers/conflict.ts";
import { handle as device } from "./handlers/device.ts";
import { handle as importBatch } from "./handlers/import.ts";
import { handle as period } from "./handlers/period.ts";
import { handle as person } from "./handlers/person.ts";
import { handle as roles } from "./handlers/roles.ts";
import { handle as settings } from "./handlers/settings.ts";
import { handle as shift } from "./handlers/shift.ts";
import { handle as stamp } from "./handlers/stamp.ts";
import { handle as tip } from "./handlers/tip.ts";
import { handle as token } from "./handlers/token.ts";
import { truncate } from "./time.ts";
import { COMMAND_TYPES } from "./types.ts";
import type {
  ApplyContext,
  Command,
  CommandOf,
  Family,
  FamilyOf,
  Outcome,
  WorldState,
} from "./types.ts";

export type { ApplyContext, Command, Outcome } from "./types.ts";

/** Every family's handler. A missing family is a type error. */
export const HANDLERS: { readonly [F in Family]: Handler<CommandOf<F>> } = {
  stamp,
  person,
  token,
  shift,
  conflict,
  device,
  tip,
  import: importBatch,
  period,
  confirmation,
  settings,
  roles,
};

/** The family names, in the table's order. */
export const FAMILIES = Object.keys(HANDLERS) as Family[];

export function familyOf<T extends Command["type"]>(type: T): FamilyOf<T> {
  return type.split(".")[0] as FamilyOf<T>;
}

export function apply(
  state: WorldState,
  command: Command,
  ctx: ApplyContext,
): Outcome {
  // Commands come back from storage on replay: only a listed type reaches a
  // handler, and a type such as "constructor" never reaches a prototype.
  const known =
    typeof command.type === "string" &&
    Object.hasOwn(COMMAND_TYPES, command.type);
  const handler = known
    ? (HANDLERS[familyOf(command.type)] as Handler<Command> | undefined)
    : undefined;
  if (!handler)
    return {
      ok: false,
      refusal: { code: "invalid", detail: { reason: "unknown command" } },
    };

  const now = truncate(ctx.now);
  const hctx: HandlerContext = {
    ...ctx,
    now,
    event: (e) => ({
      id: ctx.newId("audit"),
      at: now,
      actor: ctx.actor,
      origin: { surface: surfaceOf(ctx.actor) },
      ...e,
    }),
  };
  const out = handler(state, command, hctx);
  if (!out.ok) return out;

  // Rule 10: every accepted command by a person or a kiosk leaves a trace.
  if (ctx.actor.kind !== "system" && out.events.length === 0)
    throw new Error(`${command.type} was accepted without an audit event`);
  return {
    ok: true,
    state: { ...out.state, audit: [...state.audit, ...out.events] },
    events: out.events,
    ...(out.result ? { result: out.result } : {}),
  };
}
