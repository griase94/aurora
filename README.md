# Aurora

Aurora is a design system for Svelte 5: design tokens, accessible components and the engines behind
them, built for line-of-business applications. It ships as versioned packages that apps pin, with a
live showcase (Aurora Atlas) and a Handbook that explain every component to people and to coding
agents alike. Brands are data: an app brings its logo and colours, Aurora brings the rest.

**Status: pre-release.** The kit packages are on their way into this repository. Releases `0.0.x` are
pipeline proofs that exercise CI and the release workflow; they contain no kit code. APIs may change
in any `0.x` minor release.

Aurora Atlas (every component, live, in Light and Dark) and the Handbook (when to use what, and
how) move here with the kit; their public link follows once they are built from this repository.

## Using Aurora in an app

Every merged change to a package produces a [release](../../releases) with the packed tarballs,
`SHA256SUMS` and a build provenance attestation. Until the packages are on npm, an app (pnpm 10.x;
pnpm 11 ignores the overrides this needs, see the contract) pins the release assets by URL and
imports them under a neutral name, `@aurora/<name>`. One command does it, checks every tarball
against `SHA256SUMS` and records the checksums:

```sh
node scripts/aurora-pin.mjs 0.1.0 --owner <owner> --add svelte
```

`<owner>` is the account that owns this repository; copy
[`scripts/consumer/aurora-pin.mjs`](scripts/consumer/aurora-pin.mjs) into the app first. The whole
contract (what it writes and why, integrity, bumps, npm later, local development against a checkout)
is in [docs/CONSUMING.md](docs/CONSUMING.md).

## Working on Aurora

```sh
pnpm install
pnpm lint && pnpm check && pnpm test:fast
pnpm aurora:pack        # build, pack and check every package as a consumer gets it
```

To try the packed packages in a throwaway project, keep the tarballs and run the consumer smoke on
them: `pnpm aurora:pack --out .pack && node scripts/consumer-smoke.mjs .pack` (`*.tgz` is ignored by
git).

Labels, the version policy and the rules for pull requests are in [CONTRIBUTING.md](CONTRIBUTING.md);
agents start at [AGENTS.md](AGENTS.md).

## Licence

Aurora is licensed under the [GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`).
If you use Aurora in software you don't publish under the AGPL (for example a closed-source app or SaaS), you need a commercial licence: ask the copyright holder via a GitHub issue on this repo.

Contributions need a signed contributor licence agreement, so the project can keep offering commercial licences.
Third-party material Aurora ships is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
