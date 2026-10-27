# Changelog maintenance

Follow [documentation/changelog-maintenance.md](documentation/changelog-maintenance.md)
for Audiom-wide change history. Add a new `.changelog/<id>.json` for behavior,
widget compatibility, dependency and operational changes. Breaking changes need
migration advice; internal-only work needs an explicit reason.
Keep published fragments immutable. Direct commits need notes too.

Validate with `node scripts/check-changelog-note.mjs <base-sha> HEAD`.
Keep this dependency-free checker in sync with the canonical frontend copy.
