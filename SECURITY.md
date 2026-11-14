# Security policy

## Reporting a vulnerability

Please report security issues **privately** through GitHub: open the repository's **Security** tab
and choose **Report a vulnerability** (private vulnerability reporting). Do not open a public issue,
pull request or discussion for a vulnerability.

Include what you found, the affected package and version, and how to reproduce it. You will get an
answer through the advisory; a fix ships as a regular release, and the advisory is published once
apps have had a chance to update.

## Supported versions

Aurora is pre-release (`0.x`). Only the latest release receives fixes.

## Release integrity

Every release asset is listed in `SHA256SUMS` and carries a build provenance attestation. Verify
that the release workflow signed it on `main`:

```sh
gh attestation verify <tarball> --repo <owner>/aurora \
  --signer-workflow <owner>/aurora/.github/workflows/release.yml --source-ref refs/heads/main
```
