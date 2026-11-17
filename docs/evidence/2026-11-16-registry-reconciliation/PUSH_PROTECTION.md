# Push-protection cleanup

The first attempted branch push was rejected by GitHub push protection. No PR or remote branch was created by that attempt.

The flagged value came from a negative test which constructs a synthetic credential-like input (`prefix` plus repeated characters). Test titles interpolated the input into persisted TAP logs. It was not a real Stripe key, and no Stripe service was called.

Changes:
- Test titles now use numbered case labels; the rejection assertions and fixture construction remain unchanged.
- Redacted the synthetic value from both historical registry logs.
- Reran the registry suite: **92 passed, 0 failed**. The new output does not contain the flagged pattern.
- Recomputed source/artifact manifests and recreated the two **unpushed** commits, preserving the original base and merge parent `c1f13917fbec41ee50f4c42419c80b63176dbb59`.
- Sanitised registry checkpoint: `1d01e17573b7c86e0668d736978156415699c9cd`. The old local commits `dd99064` and `175de35` are not ancestors of the replacement branch tip.

No secret-scanning exception, force push, alternate branch or production change was used. Historical test counts remain historical; the fresh label-only-change test run is saved separately.
