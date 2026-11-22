/**
 * Public safety of the example's own strings (H17). Everything under
 * `examples/**` is public, so its sample data must be fiction by construction:
 * mail at the reserved example domains, phone numbers from the ranges kept
 * for film and television, IBANs on a bank code no bank holds, links only to
 * reference sites, no local paths and nothing that looks like a secret.
 *
 * Names that must never appear (of real businesses or people) are not listed
 * here, because listing them would publish them: the scan takes them from the
 * environment variable `PUBLIC_SAFETY_DENY` (comma-separated), set where the
 * list is known.
 */

/** Fiction phone ranges per country code: Berlin and Hamburg's film-and-television blocks. */
export const FICTION_PHONE_PREFIXES = ["+49 30 23125", "+49 40 66969"];

/** The bank code the generated IBANs use; no bank holds it. */
export const FICTION_BANK_CODE = "00010000";

/** Hosts a link may point to: the reserved example domains and reference documentation. */
export const ALLOWED_HOSTS = [
  /^(?:[\w-]+\.)*example\.(?:com|org|net)$/,
  /^(?:[\w-]+\.)*example$/,
  /^developer\.mozilla\.org$/,
  /^svelte\.dev$/,
  /^www\.w3\.org$/,
  /^react-aria\.adobe\.com$/,
  /^tc39\.es$/,
];

const EMAIL = /[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g;
const PHONE = /\+\d{1,3}(?:[ \u00a0-]?\d){6,}/g;
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
const URL_HOST = /\bhttps?:\/\/([^/\s"'`)<>]+)/g;
const LOCAL_PATH =
  /(?:\/Users\/[\w.-]+|\/home\/[a-z][\w.-]*|[A-Z]:\\(?:Users|Documents)|~\/Projects\b)/g;
const SECRETS: [RegExp, string][] = [
  [/\bghp_[A-Za-z0-9]{20,}/, "a GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/, "a GitHub token"],
  [/\bsk-[A-Za-z0-9-]{20,}/, "an API key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "a cloud access key"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, "a chat token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
];

/** The words of `PUBLIC_SAFETY_DENY`, lower-cased. */
export function denyList(
  value = process.env.PUBLIC_SAFETY_DENY ?? "",
): string[] {
  return value
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

/** The problems of one file's text; empty when it is safe to publish. */
export function safetyProblems(
  path: string,
  text: string,
  deny: readonly string[] = [],
): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(EMAIL)) {
    const domain = m[1]!.toLowerCase();
    if (!/(?:^|\.)example\.(?:com|org|net)$|\.example$/.test(domain))
      out.push(`${path}: mail address at ${domain}; use example.com`);
  }
  for (const m of text.matchAll(PHONE)) {
    const n = m[0].replace(/[\u00a0-]/g, " ");
    if (
      !FICTION_PHONE_PREFIXES.some((p) =>
        n.replace(/ /g, "").startsWith(p.replace(/ /g, "")),
      )
    )
      out.push(`${path}: phone number ${m[0]} outside the fiction ranges`);
  }
  for (const m of text.matchAll(IBAN)) {
    const iban = m[0];
    if (!/^DE\d{2}/.test(iban) || iban.slice(4, 12) !== FICTION_BANK_CODE)
      out.push(`${path}: account ${iban} is not on the fiction bank code`);
  }
  for (const m of text.matchAll(URL_HOST)) {
    const host = m[1]!.toLowerCase().replace(/:\d+$/, "");
    if (!ALLOWED_HOSTS.some((re) => re.test(host)))
      out.push(`${path}: link to ${host}, which is not on the reference list`);
  }
  for (const m of text.matchAll(LOCAL_PATH))
    out.push(`${path}: local path ${m[0]}`);
  for (const [re, what] of SECRETS)
    if (re.test(text)) out.push(`${path}: something that looks like ${what}`);
  const lower = text.toLowerCase();
  for (const word of deny)
    if (lower.includes(word)) out.push(`${path}: a name from the deny list`);
  return out;
}
