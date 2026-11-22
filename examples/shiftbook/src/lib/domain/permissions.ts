/**
 * Permissions: fixed per role, except the one switch the owner holds
 * (`managerMayClose`). The role is read from the world, not from the actor,
 * so a persona whose role changed cannot act on the old one.
 */
import type { Actor, Refusal, Role, WorldState } from "./types.ts";

export const ACTIONS = [
  "own.view",
  "stamp",
  "staff.manage",
  "token.manage",
  "shift.correct",
  "tip.manage",
  "period.confirmOwn",
  "period.close",
  "period.reopen",
  "export",
  "settings.manage",
] as const;
export type Action = (typeof ACTIONS)[number];

type Grant = boolean | "if_manager_may_close";

const TABLE: Record<Action, Record<Role, Grant>> = {
  "own.view": { owner: true, manager: true, employee: true },
  stamp: { owner: true, manager: true, employee: true },
  "period.confirmOwn": { owner: true, manager: true, employee: true },
  "staff.manage": { owner: true, manager: true, employee: false },
  "token.manage": { owner: true, manager: true, employee: false },
  "shift.correct": { owner: true, manager: true, employee: false },
  "tip.manage": { owner: true, manager: true, employee: false },
  "period.close": {
    owner: true,
    manager: "if_manager_may_close",
    employee: false,
  },
  export: { owner: true, manager: "if_manager_may_close", employee: false },
  "period.reopen": { owner: true, manager: false, employee: false },
  "settings.manage": { owner: true, manager: false, employee: false },
};

const forbidden = (action: Action, reason: string): Refusal => ({
  code: "forbidden",
  detail: { action, reason },
});

/**
 * Whether an actor may take an action. A kiosk may only stamp. The system
 * actor is the demo's own hand and may do everything. A person must exist and
 * be active.
 */
export function can(
  state: WorldState,
  actor: Actor,
  action: Action,
): true | Refusal {
  if (actor.kind === "system") return true;
  if (actor.kind === "kiosk")
    return action === "stamp" ? true : forbidden(action, "kiosk");
  const person = state.people[actor.personId];
  if (!person) return forbidden(action, "unknown_person");
  if (person.status !== "active") return forbidden(action, "inactive_person");
  const grant = TABLE[action][person.role];
  if (grant === true) return true;
  if (grant === "if_manager_may_close" && state.settings.managerMayClose)
    return true;
  return forbidden(action, "role");
}
