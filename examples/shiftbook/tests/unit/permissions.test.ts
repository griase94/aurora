import { describe, expect, it } from "vitest";
import { ACTIONS, can, type Action } from "../../src/lib/domain/permissions.ts";
import type {
  Actor,
  LocationId,
  Person,
  PersonId,
  Role,
  WorldState,
} from "../../src/lib/domain/types.ts";
import { seedWorld } from "../../src/lib/world/seed.ts";

const world = seedWorld("kranich", "evening");
const byRole = (role: Role): Person => {
  const p = Object.values(world.people).find(
    (x) => x.role === role && x.status === "active",
  );
  if (!p) throw new Error(`the seed has no active ${role}`);
  return p;
};
const actorOf = (p: Person): Actor => ({
  kind: "person",
  personId: p.id,
  role: p.role,
});
const allowed = (state: WorldState, actor: Actor) =>
  ACTIONS.filter((a) => can(state, actor, a) === true);

describe("permissions: the table of roles", () => {
  it("an owner may do everything", () => {
    expect(allowed(world, actorOf(byRole("owner")))).toEqual([...ACTIONS]);
  });

  it("a manager manages staff, tokens, shifts and tips, but neither reopens nor manages settings", () => {
    expect(allowed(world, actorOf(byRole("manager")))).toEqual<Action[]>([
      "own.view",
      "stamp",
      "staff.manage",
      "token.manage",
      "shift.correct",
      "tip.manage",
      "period.confirmOwn",
    ]);
  });

  it("a manager closes periods and exports only while the owner's switch allows it", () => {
    const manager = actorOf(byRole("manager"));
    const switched = {
      ...world,
      settings: { ...world.settings, managerMayClose: true },
    };
    expect(can(world, manager, "period.close")).toMatchObject({
      code: "forbidden",
    });
    expect(can(switched, manager, "period.close")).toBe(true);
    expect(can(switched, manager, "export")).toBe(true);
    expect(can(switched, manager, "period.reopen")).toMatchObject({
      code: "forbidden",
    });
  });

  it("an employee sees their own data, stamps and confirms their own period, nothing else", () => {
    expect(allowed(world, actorOf(byRole("employee")))).toEqual<Action[]>([
      "own.view",
      "stamp",
      "period.confirmOwn",
    ]);
  });

  it("the role is read from the world, not from the actor", () => {
    const employee = byRole("employee");
    const claimed: Actor = {
      kind: "person",
      personId: employee.id,
      role: "owner",
    };
    expect(can(world, claimed, "settings.manage")).toMatchObject({
      code: "forbidden",
      detail: { reason: "role" },
    });
  });

  it("an unknown or inactive person may do nothing", () => {
    const ghost: Actor = {
      kind: "person",
      personId: "person_nobody" as PersonId,
      role: "owner",
    };
    expect(allowed(world, ghost)).toEqual([]);
    const inactive = Object.values(world.people).find(
      (p) => p.status !== "active",
    );
    if (!inactive) throw new Error("the seed has no inactive person");
    expect(allowed(world, actorOf(inactive))).toEqual([]);
  });

  it("a kiosk may only stamp; the system actor may do everything", () => {
    const kiosk: Actor = {
      kind: "kiosk",
      locationId: "loc_kranich_markt" as LocationId,
    };
    expect(allowed(world, kiosk)).toEqual(["stamp"]);
    expect(allowed(world, { kind: "system" })).toEqual([...ACTIONS]);
  });
});
