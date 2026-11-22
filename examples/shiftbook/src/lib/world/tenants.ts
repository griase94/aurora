/**
 * The two fictional businesses, as far as the world needs them: zones,
 * branches, the period's start day and the thresholds of the rules. Their
 * brands, logos and wording live with the app shell, which reads these facts.
 *
 * Every name, street and number here is invented.
 */
import type {
  Lang,
  Location,
  LocationId,
  TenantId,
  TenantSettings,
} from "../domain/types.ts";

export interface TenantFacts {
  id: TenantId;
  name: string;
  legalName: string;
  /** Which message pack. */
  language: Lang;
  /** Which formats: English words can come with German formats ("en-DE"). */
  locale: string;
  settings: TenantSettings;
  locations: Location[];
  /** Personnel numbers start with this letter. */
  numberPrefix: string;
}

const id = (s: string) => s as LocationId;

const kranich: TenantFacts = {
  id: "kranich",
  name: "Café Kranich",
  legalName: "Café Kranich GmbH (fictional)",
  language: "de",
  locale: "de-DE",
  numberPrefix: "K",
  settings: {
    timeZone: "Europe/Berlin",
    currency: "EUR",
    periodStartDay: 21,
    openShiftWarningHours: 15,
    scanRepeatSeconds: 60,
    clockSkewWarningMinutes: 3,
    managerMayClose: false,
    personnelFields: {
      birthDate: "required",
      address: "required",
      contact: "required",
      emergencyContact: "required",
      employment: "required",
      pay: "required",
      tax: "required",
      healthInsurer: "optional",
      bank: "required",
    },
    wording: {},
  },
  locations: [
    {
      id: id("loc_kranich_markt"),
      name: "Am Markt",
      timeZone: "Europe/Berlin",
      address: {
        street: "Kranichmarkt 4",
        postcode: "10999",
        city: "Berlin",
        country: "DE",
      },
    },
    {
      id: id("loc_kranich_park"),
      name: "Im Park",
      timeZone: "Europe/Berlin",
      address: {
        street: "Reiherweg 17",
        postcode: "10999",
        city: "Berlin",
        country: "DE",
      },
    },
  ],
};

const hafenbar: TenantFacts = {
  id: "hafenbar",
  name: "Hafenbar Nord",
  legalName: "Hafenbar Nord UG (fictional)",
  language: "en",
  locale: "en-DE",
  numberPrefix: "H",
  settings: {
    timeZone: "Europe/Berlin",
    currency: "EUR",
    periodStartDay: 1,
    openShiftWarningHours: 15,
    scanRepeatSeconds: 60,
    clockSkewWarningMinutes: 3,
    managerMayClose: true,
    personnelFields: {
      birthDate: "required",
      address: "required",
      contact: "required",
      emergencyContact: "hidden",
      employment: "required",
      pay: "required",
      tax: "required",
      healthInsurer: "optional",
      bank: "required",
    },
    wording: {},
  },
  locations: [
    {
      id: id("loc_hafenbar_hamburg"),
      name: "Hamburg",
      timeZone: "Europe/Berlin",
      address: {
        street: "Kaimauer 9",
        postcode: "20999",
        city: "Hamburg",
        country: "DE",
      },
    },
    {
      id: id("loc_hafenbar_helsinki"),
      name: "Helsinki",
      timeZone: "Europe/Helsinki",
      address: {
        street: "Laiturikatu 3",
        postcode: "00999",
        city: "Helsinki",
        country: "FI",
      },
    },
  ],
};

export const TENANTS: Readonly<Record<TenantId, TenantFacts>> = {
  kranich,
  hafenbar,
};

export function tenantFacts(tenantId: TenantId): TenantFacts {
  return TENANTS[tenantId];
}
