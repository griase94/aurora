/**
 * The `device` family. Not built yet: every command refuses with `invalid` and
 * `detail.reason: "not built"`. The lane that builds this family replaces the
 * body below and edits no other file.
 */
import { notBuilt, type Handler } from "../handler.ts";
import type { CommandOf } from "../types.ts";

export const handle: Handler<CommandOf<"device">> = notBuilt("device");
