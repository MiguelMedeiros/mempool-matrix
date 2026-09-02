# Releasing

Current stable release: `v1.0.1`.

This checklist applies to every release after the public `1.0.0` baseline. The
GitHub Releases page and the Container workflow are the current source of truth;
version and digest values below record historical evidence, not an automatic
upgrade target.

## Prepare the release

- [ ] Choose a strict SemVer version from the compatibility and product scope.
- [ ] Update `package.json`, `package-lock.json`, and `CHANGELOG.md` together.
- [ ] Preserve all historical tags locally and remotely; never rewrite or delete
      them to simplify a release.
- [ ] Confirm the release commit is clean and run `npm test`,
      `npm run test:coverage`, `npm run lint`, `npm run build`,
      `npm run audit:security`, `npm run container:smoke`, and
      `git diff --check`.
- [ ] Review open bugs, failed or flaky CI, dependency findings, security alerts,
      secrets handling, settings authentication, upstream fetching, persistence,
      and rollback risk.
- [ ] Merge through `main`, then require CI, CodeQL, Secret Scan, and Container
      checks for the exact merged revision to finish successfully.

## Publish and verify

- [ ] Create and push an annotated strict SemVer tag at the verified `main`
      revision. Do not move an existing tag.
- [ ] Require the tag's CI and both Container architecture validations to pass.
      Publication is allowed only for a strict `v*` SemVer tag or an explicitly
      enabled manual workflow run.
- [ ] Record the published GHCR multi-architecture index digest and verify
      `linux/amd64` and `linux/arm64` manifests.
- [ ] Verify the attached SBOM and provenance attestations refer to that source
      revision and digest.
- [ ] Verify package visibility and anonymous digest-based access. Never treat a
      mutable image tag as the deployment identity.
- [ ] Create the GitHub Release from the closed changelog only after source and
      container gates pass, then verify its tag, target revision, and release
      assets.

## Deploy and close

- [ ] Back up persistent state before a schema or persistence change and preserve
      a tested rollback image/reference.
- [ ] Deploy the exact verified revision or immutable image digest through the
      established production Compose path without deleting or recreating data
      volumes.
- [ ] Verify container health, restart count, representative API/UI behavior,
      logs, persistence, and the OCI revision label through the canonical site.
- [ ] Confirm README, public docs, repository metadata, and the deployed site
      describe the released behavior before announcing completion.

## Current release evidence

The `v1.0.1` release publishes
`ghcr.io/miguelmedeiros/mempool-matrix:1.0.1` as a multi-architecture OCI index:

```text
sha256:1dd72c603989dfa53c1089136c6aafca006de815b95545283ec0ee8ab26cab42
```

Verify newer releases from their GitHub Release and exact tag workflow instead
of copying this historical version or digest into automation.

## Umbrel gate

Umbrel remains a draft follow-up. Pin any package proposal to a verified release
and immutable multi-architecture digest, then run the official lint plus full
install, restart, upgrade, and persistence tests before submission. Do not
describe the package as accepted, listed, or production-ready in advance.
