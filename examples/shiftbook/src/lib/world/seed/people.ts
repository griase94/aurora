/**
 * The seed's `people` part: the roster of the dataset, each person with a
 * complete personnel record and a badge. Contact data is fiction by
 * construction: mail addresses at `example.com`, phone numbers from the
 * ranges reserved for film and television, IBANs with valid check digits on
 * the bank code 000 100 00, which no bank holds.
 */
import type {
  AccessToken,
  Person,
  PersonId,
  Role,
  TokenId,
} from "../../domain/types.ts";
import {
  FAMILY_NAMES,
  GIVEN_NAMES,
  ROSTERS,
  type RosterEntry,
} from "../people.ts";
import type { Prng } from "../prng.ts";
import type { SeedPart } from "../seed.ts";

/** The busy dataset's head count. */
export const BUSY_PEOPLE = 400;

/** The fiction ranges the phone numbers come from, per tenant (Berlin and Hamburg). */
export const FICTION_PHONE = {
  kranich: "+49 30 23125",
  hafenbar: "+49 40 66969",
} as const;

/** A bank code in a clearing area that does not exist. */
export const FICTION_BANK_CODE = "00010000";

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** An opaque badge code: "sb_" and 26 base32 characters (130 bits). */
export function badgeCode(prng: Prng): string {
  let s = "sb_";
  for (let i = 0; i < 26; i++) s += BASE32[prng.int(0, 31)];
  return s;
}

/** A German IBAN on the fiction bank code, with valid check digits. */
export function fictionIban(account: number): string {
  const bban = FICTION_BANK_CODE + String(account).padStart(10, "0");
  // "DE00" moved to the end, letters as numbers: D = 13, E = 14.
  const digits = `${bban}131400`;
  let rest = 0;
  for (const ch of digits) rest = (rest * 10 + Number(ch)) % 97;
  return `DE${String(98 - rest).padStart(2, "0")}${bban}`;
}

/** Invented street names; with the fiction postcodes no address is real. */
const STREETS = [
  "Wolkengasse",
  "Am Nebelturm",
  "Kranichhof",
  "Möwenstieg",
  "Lerchenpfad",
  "Reiherbogen",
];
const INSURERS = ["Gesundkasse Nord (fictional)", "Kasse am Fluss (fictional)"];

function mailbox(
  entry: Pick<RosterEntry, "givenName" | "familyName" | "mailbox">,
): string {
  if (entry.mailbox) return entry.mailbox;
  return [entry.givenName, entry.familyName]
    .filter(Boolean)
    .join(".")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z.-]/g, "");
}

function kioskName(entry: RosterEntry): string {
  if (entry.kioskName) return entry.kioskName;
  return entry.familyName
    ? `${entry.givenName} ${entry.familyName[0]}.`
    : entry.givenName;
}

export const part: SeedPart = (ctx, draft) => {
  const { tenant, scenario, prng } = ctx;
  const roster = ROSTERS[tenant.id];
  const entries: RosterEntry[] =
    scenario.people === "owner"
      ? roster.filter((r) => r.role === "owner")
      : [...roster];

  if (scenario.people === "busy") {
    const roles: Role[] = [
      "employee",
      "employee",
      "employee",
      "employee",
      "employee",
      "employee",
      "manager",
    ];
    for (let i = 0; entries.length < BUSY_PEOPLE; i++) {
      entries.push({
        key: `g${String(i + 1).padStart(3, "0")}`,
        givenName: GIVEN_NAMES[i % GIVEN_NAMES.length]!,
        familyName:
          FAMILY_NAMES[
            Math.floor(i / GIVEN_NAMES.length) % FAMILY_NAMES.length
          ]!,
        role: roles[i % roles.length]!,
        status: "active",
        locations: [i % tenant.locations.length],
        tipEligible: true,
        employment: prng.pick(["full_time", "part_time", "marginal"] as const),
        hourly: prng.pick([1300, 1450, 1600, 1800]),
        birthDate: `${prng.int(1970, 2006)}-0${prng.int(1, 9)}-1${prng.int(0, 9)}`,
        since: `202${prng.int(0, 5)}-0${prng.int(1, 9)}-01`,
      });
    }
  }

  entries.forEach((entry, index) => {
    const id = `person_${tenant.id}_${entry.key}` as PersonId;
    const n = index + 1;
    const street = `${STREETS[n % STREETS.length]} ${prng.int(1, 120)}`;
    const home = tenant.locations[entry.locations[0] ?? 0]!.address;
    const phone = (k: number) =>
      `${FICTION_PHONE[tenant.id]} ${String(k % 1000).padStart(3, "0")}`;
    const person: Person = {
      id,
      number: `${tenant.numberPrefix}-${String(n).padStart(4, "0")}`,
      givenName: entry.givenName,
      familyName: entry.familyName,
      kioskName: kioskName(entry),
      role: entry.role,
      status: entry.status,
      locationIds: entry.locations.map((i) => tenant.locations[i]!.id),
      tipEligible: entry.tipEligible,
      record: {
        birthDate: entry.birthDate,
        address: {
          street,
          postcode: home.postcode,
          city: home.city,
          country: home.country,
        },
        contact: { email: `${mailbox(entry)}@example.com`, phone: phone(n) },
        ...(tenant.settings.personnelFields.emergencyContact === "hidden"
          ? {}
          : {
              emergencyContact: {
                name: `Contact of ${entry.givenName}`,
                phone: phone(500 + n),
              },
            }),
        employment: {
          type: entry.employment,
          since: entry.since,
          ...(entry.leftOn ? { leftOn: entry.leftOn } : {}),
          ...(entry.employment === "full_time"
            ? { weeklyMinutes: 40 * 60 }
            : {}),
        },
        pay: { hourly: entry.hourly },
        tax: {
          id: `0${String(prng.int(0, 999_999_999)).padStart(10, "0")}`,
          class: prng.pick([1, 1, 1, 3, 4, 5]),
          ...(tenant.settings.personnelFields.healthInsurer === "hidden"
            ? {}
            : { healthInsurer: prng.pick(INSURERS) }),
        },
        bank: {
          holder: [entry.givenName, entry.familyName].filter(Boolean).join(" "),
          iban: fictionIban(
            (tenant.id === "kranich" ? 1_000_000 : 2_000_000) + n,
          ),
        },
      },
    };
    draft.people[id] = person;

    const issuedAt = `${entry.since}T08:00:00Z`;
    const token = (suffix: number, t: Partial<AccessToken>): AccessToken => ({
      id: `token_${tenant.id}_${entry.key}_${suffix}` as TokenId,
      personId: id,
      kind: "qr",
      code: badgeCode(prng),
      status: "active",
      issuedAt,
      ...t,
    });
    const tokens: AccessToken[] =
      entry.badge === "replaced"
        ? [
            token(1, { status: "replaced", endedAt: "2026-06-01T08:00:00Z" }),
            token(2, { kind: "nfc", issuedAt: "2026-06-01T08:00:00Z" }),
          ]
        : entry.badge === "locked"
          ? [token(1, { status: "locked", endedAt: "2026-11-02T08:00:00Z" })]
          : entry.status === "left"
            ? [
                token(1, {
                  status: "locked",
                  endedAt: `${entry.leftOn ?? entry.since}T18:00:00Z`,
                }),
              ]
            : [token(1, {})];
    for (const t of tokens) draft.tokens[t.id] = t;
  });
};
