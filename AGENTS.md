# Changelog maintenance

Follow [xrnavigation/changelog-tools](https://github.com/xrnavigation/changelog-tools#writing-a-note)
for Audiom-wide change history. Add a new `.changelog/<id>.json` for behavior,
widget compatibility, dependency and operational changes, with
`npx -p git+https://github.com/xrnavigation/changelog-tools.git changelog-note`.
Breaking changes need migration advice; internal-only work needs an explicit
reason. Keep published fragments immutable. Direct commits need notes too.
