# Consuming Aurora

How an app depends on Aurora, today (release assets) and later (npm), and how it moves from one
version to the next. `<owner>` below is the GitHub account that owns the Aurora repository.

## Versions

- Every pull request merged into `main` that changes a package releases a new version, with no human
  step. The pull request's label picks the level: `aurora:patch`, `aurora:minor`, `aurora:major`
  (`aurora:skip` releases nothing).
- All packages share one version (lockstep). Install packages of the same version together.
- While Aurora is `0.x`, a **minor** release may break your app; a patch release does not.
- `0.0.x` releases are pipeline proofs (the `aurora-canary` package). Do not depend on them.

## Today: release assets

Until the packages are on npm, an app needs **pnpm 10 or newer**: the contract relies on
`pnpm.overrides`, and `aurora-pin` runs `pnpm install`. npm (`overrides`), Yarn (`resolutions`) and
Bun are not supported yet.

Each [GitHub release](../../../releases) carries one tarball per package, `SHA256SUMS`, and release
notes with the snippet for that version. An app's `package.json`, as `aurora-pin` writes it:

```json
{
  "dependencies": {
    "@aurora/svelte": "https://github.com/<owner>/aurora/releases/download/v0.1.0/griase94-aurora-svelte-0.1.0.tgz"
  },
  "pnpm": {
    "overrides": {
      "@griase94/aurora-svelte": "https://github.com/<owner>/aurora/releases/download/v0.1.0/griase94-aurora-svelte-0.1.0.tgz",
      "@griase94/aurora-tokens": "https://github.com/<owner>/aurora/releases/download/v0.1.0/griase94-aurora-tokens-0.1.0.tgz"
    }
  },
  "aurora": {
    "sha256": {
      "griase94-aurora-svelte-0.1.0.tgz": "<sha256 from SHA256SUMS>",
      "griase94-aurora-tokens-0.1.0.tgz": "<sha256 from SHA256SUMS>"
    }
  }
}
```

- **The key is the import name.** Code imports `@aurora/svelte`; pnpm links the tarball under that
  key, so the npm scope never appears in app code and a scope change touches only `package.json`.
  List only the packages you import.
- **Every package of the release gets an override**, including the ones you do not list. A packed
  package depends on its siblings under their scoped names (pnpm rewrites `workspace:*` to
  `@griase94/aurora-tokens@0.1.0` on pack). Without an override for a sibling, pnpm asks the npm
  registry for that name: today the install fails, and once anyone can publish under the scope it
  would install their package (dependency confusion). With an override for each package, every
  Aurora name resolves to a tarball of the same release, one copy each. `aurora-pin` reads the
  release's package list from its `SHA256SUMS`, so you never maintain this list by hand. Keep the
  overrides until the packages are on npm under a reserved scope.
- **Integrity is checked by `aurora-pin`, not by pnpm.** pnpm records no `integrity` for a tarball
  URL outside a registry; `pnpm-lock.yaml` holds only `resolution: { tarball: <url> }`, and
  `pnpm install --frozen-lockfile` installs whatever bytes the URL serves. Two things protect an app:
  1. **Immutable releases.** Aurora's repository turns on GitHub's immutable releases, so a
     published release's assets and tag cannot be replaced. (Until that switch is on, treat the
     next point as the only guard.)
  2. **Checksums.** `aurora-pin` downloads `SHA256SUMS` and every tarball, refuses to pin when one
     does not match, and records each tarball's sha256 under `aurora.sha256`. Run
     `node scripts/aurora-pin.mjs --verify` in the app's CI: it downloads the pinned assets again and
     fails when one differs from the recorded checksum.
- **Provenance** (optional, in CI or by hand): each tarball carries a build provenance attestation.

  ```sh
  gh release download v0.1.0 --repo <owner>/aurora
  sha256sum -c SHA256SUMS
  gh attestation verify griase94-aurora-svelte-0.1.0.tgz --repo <owner>/aurora
  ```

- **Hosting.** Release assets of a public repository download without authentication, so a build on
  any CI or hosting provider needs no token.

## Pinning a version: `aurora-pin`

Copy [`scripts/consumer/aurora-pin.mjs`](../scripts/consumer/aurora-pin.mjs) into your app as
`scripts/aurora-pin.mjs` (it needs only Node 24) and run it from the app's root:

```sh
# first time: say where Aurora lives and which packages you import
node scripts/aurora-pin.mjs 0.1.0 --owner <owner> --add svelte

# every bump after that: the owner is read from the current pins
node scripts/aurora-pin.mjs 0.2.0

# in CI: the pinned assets still match the recorded checksums
node scripts/aurora-pin.mjs --verify
```

It rewrites every `@aurora/<name>` dependency, the overrides for every package of the release and the
recorded checksums, then runs `pnpm install` (`--no-install` skips that). The npm scope comes from the
release's tarball names; `--scope <scope>` only asserts it. Flags take `--x value` or `--x=value`;
an unknown flag is refused. Commit `package.json` and `pnpm-lock.yaml` together.

## How a bump reaches an app

1. A pull request merges into Aurora `main`; the release workflow publishes `vX.Y.Z`.
2. If the Aurora repository has a `CONSUMERS_TOKEN` secret, it sends a `repository_dispatch` event
   `aurora-released` with `client_payload.version` to each repository in its `AURORA_CONSUMERS`
   variable. Without it, an app checks on a schedule
   (`gh release list --repo <owner>/aurora --limit 1 --json tagName`; `gh release view` without a
   tag skips pre-releases, and every `0.0.x` release is one).
3. The app opens a pull request that runs `aurora-pin.mjs <version>`; its own CI decides. Read the
   release notes: each entry says whether the change is visible in apps (`fix`, `improvement`, `none`).
4. Rolling back is the same command with the previous version.

## Later: npm

Once the packages are published to npm:

```json
{
  "dependencies": {
    "@aurora/svelte": "npm:@griase94/aurora-svelte@0.4.0",
    "@aurora/tokens": "npm:@griase94/aurora-tokens@0.4.0"
  }
}
```

`node scripts/aurora-pin.mjs 0.4.0 --registry npm` writes exactly this and deletes the Aurora
overrides and the recorded checksums (the registry's lockfile entries carry `integrity`). Import
names stay the same. If the npm scope differs from the one above, Aurora runs `pnpm scope:set <scope>`
first and releases; then apps pin with `--scope <scope>`.

## Styles

The kit's stylesheet entry carries the layer order and points Tailwind at the package's own files, so
an app imports it before Tailwind:

```css
@import "@aurora/svelte/css";
@import "tailwindcss";
```

Keep one copy of the shared runtime packages in Vite (`resolve.dedupe`, for example `svelte` and
`bits-ui`). The kit's peer list arrives with the kit import.

## Developing against a local checkout

To try an unreleased change in an app without committing anything, link the checkout into the app's
`node_modules`: point `node_modules/@aurora/<name>` (and the scoped name pnpm links internally) at
`<checkout>/packages/<name>`. The packages' repository `exports` point at their sources, so Vite
compiles them directly and hot reload works; add the checkout to Vite's `server.fs.allow`. Any
`pnpm install` undoes the link. Never commit a `link:` or `file:` dependency on Aurora; an app can
guard against that in CI.

## Account or scope rename

- Release URLs contain `<owner>`. GitHub redirects a renamed account's repository and release URLs
  (as long as nobody claims the old name), so existing lockfiles keep working. Re-pin once with
  `aurora-pin.mjs <version> --owner <new-owner>`; the tarballs and their checksums stay the same.
- The npm scope is independent of the account name. Aurora changes it with one command
  (`pnpm scope:set <scope>`) that its tests check (`pnpm scope:check`).
