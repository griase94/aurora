# Contributing to Aurora

## Before you open a pull request

**External contributions wait for the contributor licence agreement.** Aurora is dual-licensed
(AGPL-3.0-only and commercial), so every contribution needs a signed CLA. The CLA tool is not set up
yet; until it is, pull requests from outside the maintainers stay open without review. Issues are
welcome now: bugs, component gaps and feature requests each have a template.

## Dev loop

Node 24 and pnpm (the version in `package.json` `packageManager`; `corepack enable` picks it up).

```sh
pnpm install
pnpm lint            # eslint . and prettier --check .
pnpm check           # type check of the scripts and every package
pnpm test:fast       # unit tests: no network, no database, no browser
pnpm aurora:pack     # build, pack, publint and attw for every package
```

Run what your change touches while you work; run `pnpm lint` before every push. Prettier never
formats `.svelte` files: keep their indentation (tabs) as it is.

## Pull requests

- One intent per pull request. Fill in the template: **Changelog** (quoted in the release notes),
  **Visible in apps** (`fix`, `improvement` or `none`) and **Not checked by CI**.
- **Exactly one release label**, checked by CI:

  | Label          | When                                         | Version while 0.x | After 1.0 |
  | -------------- | -------------------------------------------- | ----------------- | --------- |
  | `aurora:patch` | a fix or small improvement to a package      | 0.3.4 → 0.3.5     | patch     |
  | `aurora:minor` | a new feature, or **any breaking change**    | 0.3.4 → 0.4.0     | minor     |
  | `aurora:major` | refused until the maintainer declares 1.0    | –                 | major     |
  | `aurora:skip`  | nothing under `packages/` changed (docs, CI) | no release        | –         |

  A change under `packages/` always releases, so `aurora:skip` is refused there.

- **Merging**: a pull request merges when an independent reviewer has reviewed it fully with no open
  blocker, and the required check `ci-ok` is green on its final commit. The merge releases by itself
  (see `.github/workflows/release.yml`); nothing is committed back to `main`.
- A component change updates its Handbook page and its Atlas specimen in the same pull request.

## Language and public safety

- Code, comments, docs, commit messages and pull request text are in English. Default copy inside
  components is English and comes from message packs.
- This repository is public, and its history is forever. Never commit or write in a pull request:
  secrets or tokens, names of private apps, organisations or people, private issue or pull request
  numbers, local file paths, or links to private repositories. Sample data is made up, and obviously
  so.
- Owner names and package scopes are derived (from `package.json`, `git remote`, or
  `github.repository_owner`), never hard-coded, so an account or scope rename stays a one-command
  change (`pnpm scope:set`, checked by `pnpm scope:check`).

## Reporting security issues

Never in a public issue. See [SECURITY.md](SECURITY.md).
