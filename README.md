# Dispatchit SDK

This repository contains the Dispatchit SDK source & demo apps. Currently the SDK only supports Node.js, other languages & frameworks might be added in the future.

## Releasing

Releases are managed with [Changesets](https://github.com/changesets/changesets) — see
[`.changeset/README.md`](.changeset/README.md) in the repository root for the full flow:

1. Add a changeset on your PR (`pnpm changeset`).
2. Merging to `main` opens a _Version Packages_ PR that bumps the version and writes `CHANGELOG.md`.
3. Merging that PR publishes to npm and tags the release.
