# AGENTS.md: Aurora

Aurora is a Svelte 5 design system (tokens, components, Atlas showcase, Handbook) in a pnpm
workspace. This file is for coding agents; humans read README.md and CONTRIBUTING.md.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm lint                 # eslint . && prettier --check .  (before every push)
pnpm check                # tsc for scripts, `check` in every package
pnpm test:fast [files]    # vitest unit lane; pass files while iterating
pnpm aurora:pack          # build + pack + publint + attw per package
pnpm scope:check          # every @<scope>/aurora-<name> agrees with package.json
pnpm scope:set <scope>    # move all packages to another npm scope
node scripts/release.mjs  # release logic (CI runs it on main; you never release by hand)
```

`pnpm pack` is pnpm's built-in command and packs the private root: use `pnpm aurora:pack`.

## Layout

- `packages/<name>/`: released packages, all `@<scope>/aurora-<name>`, one lockstep version. In the
  repo `exports` point at `src/`; `publishConfig.exports` (applied by `pnpm pack`) at `dist/`.
  `packages/canary` is a throwaway pipeline proof and goes when the kit arrives.
- `apps/*`: Atlas and the Handbook. `examples/*`: consumer apps that install the packed tarballs.
- `scripts/`: repo tooling with tests beside each script; `scripts/consumer/aurora-pin.mjs` is copied
  into apps and must stay dependency-free.
- `docs/CONSUMING.md`: the consumer contract. Change it with any change to how apps install Aurora.

## Rules

- **Pull requests only**; never push to `main`. Draft until ready. Exactly one label of
  `aurora:{major,minor,patch,skip}`: `skip` only without `packages/**` changes, no `major` while 0.x
  (`minor` is breaking then). Fill the template's Changelog, Visible in apps and Not checked by CI.
- **Merge gate:** an independent review of the whole pull request with no blocker or major open,
  plus a green `ci-ok` on the final head commit. Never an admin override. The merge releases by
  itself; never tag or create releases by hand, never commit a version bump.
- **Public repo, forever:** no secrets, no names of private apps, organisations or people, no
  private issue or PR numbers, no local absolute paths, no links to private repositories, in code,
  commits or PR text. Fabricated sample data only. English only.
- **Derived, not hard-coded:** owner from `git remote` or `github.repository_owner`, scope from
  `package.json`.
- **Workflows:** `pull_request` only, read-only token, actions pinned by commit SHA, untrusted PR
  text only through `env:`. Run `actionlint` after editing a workflow.
- **Never run prettier on `.svelte`**; keep each file's indentation.
- **A guard per fix:** a test that fails before the fix and passes after, where practical.

## Machine limits and cleanup

- Run only the tests your change touches; the PR's CI runs the rest. Vitest uses at most two
  workers; Playwright at most two workers.
- No mutation testing or fuzzing in parallel with other work.
- Reuse a running dev server for the same checkout; stop the ones you start by port:
  `lsof -ti tcp:<port> -sTCP:LISTEN | xargs kill`. Never `pkill node`.
- Remove what you created before you finish: temporary directories, containers (`docker run --rm`),
  worktrees of merged branches. Never stash, reset or clean a worktree another agent may share;
  commit work in progress instead.
