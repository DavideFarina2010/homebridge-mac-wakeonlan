# Changelog

## 0.0.3

- English log messages, config schema and comments.
- Config schema: `required` is now an array at object level.
- Catch errors from socket setup and status checks instead of letting them go unhandled.
- Add the `supports-hap` keyword and ship `CHANGELOG.md` in the package.
- CI now tests Node 22, 24 and 26.

## 0.0.2

- Add the MIT `LICENSE` file.
- English README (Italian moved to `README.it.md`).
- Set the package author.

## 0.0.1

- Internal plugin name now matches the npm package name, so cached accessories are restored correctly after a restart.
- Publish to npm from GitHub Actions on every `v*` tag (Trusted Publishing, with provenance).

## 0.0.0

- First version: one Home switch per Mac, Wake-on-LAN magic packets, real status via ping or TCP port, optional `sleepCommand`.
