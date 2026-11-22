/**
 * The rosters, written by hand: names are data a person reviews, not output of
 * a generator. Every person here is invented. The busy dataset combines the
 * name parts below; it never draws names from anywhere else.
 *
 * The rosters cover the ranges the screens must survive: a one-word name, a
 * name of 46 characters, a right-to-left name, a zero-hours employee, an
 * inactive person, a person who left, a locked and a replaced badge.
 */
import type {
  EmploymentType,
  PersonStatus,
  Role,
  TenantId,
} from "../domain/types.ts";

export interface RosterEntry {
  /** Two digits, unique per tenant: the person's id and personnel number come from it. */
  key: string;
  givenName: string;
  familyName: string;
  /** Overrides the kiosk name "Given F." where that form does not fit the name. */
  kioskName?: string;
  /** Overrides the mail address derived from the name (ASCII only). */
  mailbox?: string;
  role: Role;
  status: PersonStatus;
  /** Indexes into the tenant's locations. */
  locations: number[];
  tipEligible: boolean;
  employment: EmploymentType;
  /** Hourly pay in minor units. */
  hourly: number;
  birthDate: string;
  since: string;
  leftOn?: string;
  /** "locked": the only badge is locked. "replaced": an old badge was replaced by an active one. */
  badge?: "locked" | "replaced";
}

const e = (
  key: string,
  givenName: string,
  familyName: string,
  rest: Partial<RosterEntry> = {},
): RosterEntry => ({
  key,
  givenName,
  familyName,
  role: "employee",
  status: "active",
  locations: [0],
  tipEligible: true,
  employment: "part_time",
  hourly: 1450,
  birthDate: "1998-04-12",
  since: "2024-03-01",
  ...rest,
});

export const ROSTERS: Readonly<Record<TenantId, readonly RosterEntry[]>> = {
  kranich: [
    e("01", "Ida", "Brenner", {
      role: "owner",
      employment: "full_time",
      hourly: 2600,
      tipEligible: false,
      locations: [0, 1],
      birthDate: "1979-09-03",
      since: "2015-05-01",
    }),
    e("02", "Jonas", "Feldmann", {
      role: "manager",
      employment: "full_time",
      hourly: 1950,
      locations: [0, 1],
      birthDate: "1988-01-22",
      since: "2019-02-01",
    }),
    e("03", "Lena", "Kowalski", {
      employment: "full_time",
      birthDate: "1996-07-30",
      since: "2021-08-15",
    }),
    e("04", "Mats", "Okafor", { badge: "replaced", birthDate: "2001-11-02" }),
    e("05", "Sophie", "Brandt", { locations: [1], birthDate: "1999-02-17" }),
    e("06", "Emil", "Haberland", {
      employment: "full_time",
      locations: [0, 1],
      birthDate: "1993-05-09",
    }),
    e("07", "Aylin", "Demirtaş", { locations: [1], birthDate: "2002-12-24" }),
    e("08", "Noah", "Weißgerber", {
      employment: "marginal",
      hourly: 1300,
      birthDate: "2004-06-01",
    }),
    e("09", "Clara", "Ruhland", {
      badge: "locked",
      locations: [1],
      birthDate: "1997-10-10",
    }),
    e("10", "Finn", "Achterberg", {
      locations: [0, 1],
      birthDate: "2000-03-14",
    }),
    e("11", "Mira", "Sandoval", {
      employment: "marginal",
      hourly: 1300,
      birthDate: "2003-08-08",
    }),
    e("12", "Paul", "Eberhardt", {
      status: "inactive",
      birthDate: "1995-01-05",
    }),
    e("13", "Greta", "Lindholm", {
      status: "left",
      leftOn: "2026-10-31",
      birthDate: "1990-09-19",
      since: "2022-04-01",
    }),
    e("14", "Bastian", "Morgenroth", {
      employment: "full_time",
      locations: [1],
      birthDate: "1987-04-27",
    }),
  ],
  hafenbar: [
    e("01", "Rune", "Halvorsen", {
      role: "owner",
      employment: "full_time",
      hourly: 2800,
      tipEligible: false,
      locations: [0, 1],
      birthDate: "1975-12-01",
      since: "2012-06-01",
    }),
    e("02", "Maren", "Thiessen", {
      role: "manager",
      employment: "full_time",
      hourly: 2100,
      locations: [0],
      birthDate: "1985-03-18",
      since: "2018-09-01",
    }),
    e("03", "Kofi", "Mensah-Brandt", {
      employment: "full_time",
      birthDate: "1994-02-11",
    }),
    e("04", "Ilse", "Varga", { birthDate: "1992-08-21" }),
    e("05", "Teodor", "Lind", { birthDate: "1999-05-05" }),
    e("06", "Juno", "Albrecht", { birthDate: "2001-01-29" }),
    e("07", "Sami", "Virtanen", {
      role: "manager",
      employment: "full_time",
      hourly: 2050,
      locations: [1],
      birthDate: "1989-11-30",
    }),
    e("08", "Aino", "Korhonen", { locations: [1], birthDate: "1998-06-16" }),
    e("09", "Maximiliane Theodora", "von Hohenstein-Wolfsbrunn", {
      kioskName: "Maximiliane v.",
      birthDate: "1996-04-04",
    }),
    e("10", "نور", "حداد", {
      kioskName: "نور ح.",
      mailbox: "nour.haddad",
      birthDate: "2000-10-20",
    }),
    e("11", "Zephyr", "", {
      kioskName: "Zephyr",
      mailbox: "zephyr",
      birthDate: "2002-02-02",
    }),
    e("12", "Lotte", "Brink", {
      employment: "zero_hours",
      hourly: 1300,
      birthDate: "2005-07-07",
    }),
    e("13", "Hauke", "Detlefsen", {
      status: "inactive",
      birthDate: "1991-03-03",
    }),
    e("14", "Wiebke", "Sönnichsen", {
      employment: "full_time",
      locations: [0, 1],
      birthDate: "1993-09-09",
    }),
  ],
};

/** Name parts for the busy dataset: combined in order, never drawn from elsewhere. */
export const GIVEN_NAMES = [
  "Anja",
  "Ben",
  "Carla",
  "Deniz",
  "Elif",
  "Frieda",
  "Gero",
  "Hanna",
  "Ilka",
  "Jakob",
  "Kaja",
  "Lasse",
  "Malin",
  "Nils",
  "Oda",
  "Pia",
  "Quentin",
  "Rosa",
  "Silas",
  "Tilda",
  "Ulla",
  "Vito",
  "Wanda",
  "Xaver",
  "Yara",
  "Zeno",
  "Amir",
  "Bente",
  "Cem",
  "Dörte",
] as const;

export const FAMILY_NAMES = [
  "Ahlgrimm",
  "Bekemeier",
  "Clausing",
  "Dornbusch",
  "Eggerstedt",
  "Fennhoff",
  "Grotjahn",
  "Hollerbach",
  "Imkamp",
  "Jessenberg",
  "Kampmeier",
  "Lüttjohann",
  "Mehrtens",
  "Nordbruch",
  "Oltmanns",
  "Pöppelmann",
  "Quast",
  "Riecken",
  "Stührenberg",
  "Tammen",
] as const;
