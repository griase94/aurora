/**
 * Forms are forms: a submit handler passes `new FormData(form)` to a pure
 * parser here, which returns a command or the errors to show. The same
 * parsers run in a server's form action. Each form adds its own file
 * (`forms/<form>.ts`); this file holds the shape they share.
 *
 * One error shape for a parser and for a refusal: with a `field` it belongs at
 * that field; without one (`unavailable`, `forbidden`) it shows above the
 * form's actions and leaves the form as typed.
 */
import type { Command, Refusal, RefusalCode } from "../types.ts";

/** The codes a parser adds to the refusal codes: a missing value and a malformed one. */
export type FormErrorCode = RefusalCode | "required" | "format";

export interface FormError {
  code: FormErrorCode;
  field?: string;
  detail?: Refusal["detail"];
}

export type Parsed<C extends Command> =
  { ok: true; command: C } | { ok: false; errors: FormError[] };

/** What a parser reads: `FormData` or anything with the same `get`. */
export interface FormSource {
  get(name: string): FormDataEntryValue | null;
}

/** A field's text, trimmed; `null` when absent or empty. */
export function text(fd: FormSource, name: string): string | null {
  const v = fd.get(name);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Collects the errors of one parse. `required` and `integer` record an error
 * and return `null`, so a parser reads every field and reports them all at
 * once, in the order of the form.
 */
export function createReader(fd: FormSource) {
  const errors: FormError[] = [];
  return {
    errors,
    /** A non-empty text, else a `required` error. */
    required(name: string): string | null {
      const v = text(fd, name);
      if (v === null) errors.push({ code: "required", field: name });
      return v;
    },
    /** An optional text. */
    optional(name: string): string | null {
      return text(fd, name);
    },
    /** A whole number (minor units, minutes), else a `format` error; `required` when empty. */
    integer(
      name: string,
      o: { required?: boolean } = { required: true },
    ): number | null {
      const v = text(fd, name);
      if (v === null) {
        if (o.required !== false)
          errors.push({ code: "required", field: name });
        return null;
      }
      if (!/^-?\d+$/.test(v) || !Number.isSafeInteger(Number(v))) {
        errors.push({ code: "format", field: name });
        return null;
      }
      return Number(v);
    },
    /** One of a fixed set of values, else a `format` error; `required` when empty. */
    oneOf<T extends string>(name: string, values: readonly T[]): T | null {
      const v = text(fd, name);
      if (v === null) {
        errors.push({ code: "required", field: name });
        return null;
      }
      if (!(values as readonly string[]).includes(v)) {
        errors.push({ code: "format", field: name });
        return null;
      }
      return v as T;
    },
  };
}

/** The result of a parse: the command when nothing failed, else every error. */
export function parsed<C extends Command>(
  errors: FormError[],
  build: () => C,
): Parsed<C> {
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, command: build() };
}
