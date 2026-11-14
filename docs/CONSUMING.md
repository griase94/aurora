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

Each [GitHub release](../../../releases) carries one tarball per package, `SHA256SUMS`, and release
notes with the snippet for that version. An app's `package.json`:

```json
{
  "dependencies": {
    "@aurora/svelte": "https://github.com/<owner>/aurora/releases/download/v0.1.0/griase94-aurora-svelte-0.1.0.tgz",
    "@aurora/tokens": "https://github.com/<owner>/aurora/releases/download/v0.1.0/griase94-aurora-tokens-0.1.0.tgz"
  },
  "pnpm": {
    "overrides": {
      "@griase94/aurora-svelte": "https://github.com/<owner>/aurora/releases/download/v0.1.0/griase94-aurora-svelte-0.1.0.tgz",
      "@griase94/aurora-tokens": "https://github.com/<owner>/aurora/releases/download/v0.1.0/griase94-aurora-tokens-0.1.0.tgz"
    }
  }
}
```

- **The key is the import name.** Code imports `@aurora/svelte`; pnpm links the tarball under that
  key, so the npm scope never appears in app code and a scope change touches only `package.json`.
- **The override is required.** A packed package depends on its siblings under their scoped names
  (pnpm rewrites `workspace:*` to `@griase94/aurora-tokens@0.1.0` on pack), and no registry serves
  those names yet. The override sends them to the same tarballs, so there is exactly one copy of each
  package, and nothing can be fetched from a registry under a name Aurora does not control
  (dependency confusion). Keep the overrides until the packages are on npm under a reserved scope.
- **Integrity.** `pnpm-lock.yaml` records `resolution: { tarball: <url>, integrity: sha512-… }`. A
  re-uploaded asset with other bytes fails `pnpm install --frozen-lockfile`.
- **Verify a download** (optional, in CI or by hand):

  ```sh
  gh release download v0.1.0 --repo <owner>/aurora
  sha256sum -c SHA256SUMS
  gh attestation verify griase94-aurora-svelte-0.1.0.tgz --repo <owner>/aurora
  ```

- **Hosting.** Release assets of a public repository download without authentication, so a build on
  any CI or hosting provider needs no token.

## Pinning a version: `aurora-pin`

Copy [`scripts/consumer/aurora-pin.mjs`](../scripts/consumer/aurora-pin.mjs) into your app (it has no
dependencies) and run it from the app's root:

```sh
# first time: say where Aurora lives and which packages you want
node scripts/aurora-pin.mjs 0.1.0 --owner <owner> --scope <scope> --add svelte,tokens

# every bump after that: owner and scope are read from the current pins
node scripts/aurora-pin.mjs 0.2.0
```

`<scope>` is the npm scope in the package names (`@griase94/aurora-svelte` has the scope
`griase94`). It rewrites every `@aurora/<name>` dependency and the matching overrides, then runs `pnpm install`
(`--no-install` skips that). Commit `package.json` and `pnpm-lock.yaml` together.

## How a bump reaches an app

1. A pull request merges into Aurora `main`; the release workflow publishes `vX.Y.Z`.
2. If the Aurora repository has a `CONSUMERS_TOKEN` secret, it sends a `repository_dispatch` event
   `aurora-released` with `client_payload.version` to each repository in its `AURORA_CONSUMERS`
   variable. Without it, an app checks on a schedule
   (`gh release view --repo <owner>/aurora --json tagName`).
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
overrides. Import names stay the same. If the npm scope differs from the one above, Aurora runs
`pnpm scope:set <scope>` first and releases; then apps pin with `--scope <scope>`.

## Styles

The kit's stylesheet entry carries the layer order and points Tailwind at the package's own files, so
an app imports it before Tailwind:

```css
@import "@aurora/svelte/css";
@import "tailwindcss";
```

Keep one copy of the shared runtime packages in Vite (`resolve.dedupe`, for example `svelte` and
`bits-ui`); the kit's `AGENTS.md` lists its peers.

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
  `aurora-pin.mjs <version> --owner <new-owner>`; the tarballs and their integrity stay the same.
- The npm scope is independent of the account name. Aurora changes it with one command
  (`pnpm scope:set <scope>`) that its tests check (`pnpm scope:check`).
