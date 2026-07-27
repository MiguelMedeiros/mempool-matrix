# Releasing

This checklist describes the publication gates for the `1.0.0` candidate. It is
preparation, not evidence that a tag, image, package, or release exists.

## Pre-publication gates

Complete these steps in order and record the resulting commit, workflow URLs, and
immutable identifiers:

- [ ] Confirm the candidate commit is clean, reviewed, and fully validated.
- [ ] Obtain Miguel's explicit approval before changing repository visibility or
      publishing the release.
- [ ] Preserve the existing tags locally and remotely as the project's historical
      SemVer record; do not rewrite or delete them for the public launch.
- [ ] Change repository visibility only in the approved release window, then
      verify an anonymous clone and all public documentation links.
- [ ] After explicit approval, create and push the annotated `v1.0.0` tag at the
      approved candidate commit.
- [ ] Require the CI, Secret Scan, and Container workflow runs for that exact tag
      to succeed without retries that change source.
- [ ] Record the GHCR multi-architecture index digest and verify both
      `linux/amd64` and `linux/arm64` manifests.
- [ ] Verify the attached SBOM and provenance attestations refer to the tagged
      source revision and recorded digest.
- [ ] Create the GitHub Release for `v1.0.0` from the closed changelog only after
      the source and container gates pass.
- [ ] Verify GHCR package visibility and anonymous digest-based access; never
      document a mutable tag as the deployment identity.
- [ ] Deploy the recorded digest to production only with separate approval,
      preserve rollback, and verify health plus representative browser workflows.
- [ ] Verify the production image revision and the public site's site commit both
      resolve to the approved release source before announcing the release.

## Later Umbrel gate

Umbrel remains a draft follow-up. After the public image exists, pin the package
to `1.0.0` and the verified multi-architecture digest, run official lint and full
install/restart/persistence tests, and review the result before any submission.
Do not describe the package as accepted, listed, or production-ready in advance.
