# Security policy

## Supported versions

novara-flex-js is pre-1.0. Security fixes go into the latest release line only; upgrade to
the newest published version to receive them.

## Reporting a vulnerability

Report vulnerabilities privately through **GitHub private vulnerability reporting**: open
the repository's **Security** tab and choose **Report a vulnerability**. Please do not open
a public issue, pull request, or discussion for a suspected vulnerability.

Include what you can of:

- the affected version and runtime (Node.js version, or other environment);
- what an attacker could do, and under which conditions;
- steps or a minimal script that reproduces it, using a dummy token and a fake `fetch`
  where possible.

**Redact before you send.** Never include an API token, the contents of a `.env` file, a
redirect URL, an attachment key, or any data from a real Novara Flex account in a report,
an issue, or a pull request. If a reproduction needs a response body, replace every value
with an invented one first. If a token may have been exposed, treat it as compromised
and replace it.

## Scope

This policy covers the SDK in this repository, for example a token, redirect target, or
attachment key leaking into an error or a request it should not reach. Vulnerabilities in
the Novara Flex service itself belong with its vendor, not here.
