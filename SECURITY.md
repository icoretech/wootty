# Security Policy

## Supported versions

WooTTY is pre-1.0. Security fixes are provided for the latest minor release.

## Reporting a vulnerability

Do not open public issues for security vulnerabilities.

Use [GitHub Security Advisories](https://github.com/icoretech/wootty/security/advisories/new) for this repository.

Or email:

- icoretech.inc@gmail.com

Include reproduction details, impact, and any suggested remediation.

## Deployment boundary

WooTTY exposes commands with the server process's permissions. The shared authentication token grants access to the instance and its sessions; it does not provide per-user isolation or a command sandbox. Use HTTPS and restrict remote access to trusted operators. See the [runtime guide](docs/runtime.md#authentication-and-remote-access) before exposing a terminal beyond loopback.
