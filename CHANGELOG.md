# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.8](https://github.com/icoretech/wootty/compare/wootty-v0.2.7...wootty-v0.2.8) (2026-03-03)


### Bug Fixes

* **terminal:** fail fast on missing socket URL in non-browser environments ([74ce930](https://github.com/icoretech/wootty/commit/74ce930610a4069a66e2dfd0cdf03615633c6789))
* **terminal:** prevent reconnect stall on CLOSING sockets and outbox byte corruption ([d5926ab](https://github.com/icoretech/wootty/commit/d5926aba857ba7878d2e7f8a20304701f86f32c4))
* **transport:** keep listeners on closing socket ([58af1ae](https://github.com/icoretech/wootty/commit/58af1ae6eaae914f71e7658a3166427f3d590a17))
* **web:** apply biome assist import-order and unused import fixes ([f33de1b](https://github.com/icoretech/wootty/commit/f33de1bcea7ba8e75e507b86b5ee409121208f77))

## [0.2.7](https://github.com/icoretech/wootty/compare/wootty-v0.2.6...wootty-v0.2.7) (2026-03-02)


### Bug Fixes

* **config:** trim host values from env and flag parsing ([#16](https://github.com/icoretech/wootty/issues/16)) ([1304922](https://github.com/icoretech/wootty/commit/1304922342f7027030ca6ec66a78d3ea553e527c))

## [0.2.6](https://github.com/icoretech/wootty/compare/wootty-v0.2.5...wootty-v0.2.6) (2026-03-02)


### Features

* **cli:** add first-class help output for root and run commands ([46ae925](https://github.com/icoretech/wootty/commit/46ae92513509d0323e5fee7041da3a3a60333c58))

## [0.2.5](https://github.com/icoretech/wootty/compare/wootty-v0.2.4...wootty-v0.2.5) (2026-03-02)


### Bug Fixes

* **docker:** document migration to openssh image flavor ([7031f70](https://github.com/icoretech/wootty/commit/7031f70be28dfdbb70c16b4892e6434ac734ccf9))

## [0.2.4](https://github.com/icoretech/wootty/compare/wootty-v0.2.3...wootty-v0.2.4) (2026-03-02)


### Bug Fixes

* **config:** parse WOOTTY_COMMAND_ARGS with shell-like quoting ([85ff153](https://github.com/icoretech/wootty/commit/85ff153698afe1f242f9e31ad505e99d97e626c5))

## [0.2.3](https://github.com/icoretech/wootty/compare/wootty-v0.2.2...wootty-v0.2.3) (2026-03-02)


### Features

* **ci:** publish multi-arch binaries on GitHub releases ([45f1202](https://github.com/icoretech/wootty/commit/45f1202b370e5a3444a1deb9a873877525453ddc))
* improve detached session retention and session UX ([4e7d268](https://github.com/icoretech/wootty/commit/4e7d26864fd050b8eb974fe8bb2412b69fdbdb7e))


### Bug Fixes

* **auth:** default websocket auth to cookie channel ([c43e525](https://github.com/icoretech/wootty/commit/c43e5257737d677ee96f1c9eba68733adfc5e299))
* **ci:** align README runtime path with docs verifier ([3556dea](https://github.com/icoretech/wootty/commit/3556dea05b11f4453573bd66f5327835a361101b))
* **ci:** build release binaries from Go module path ([5215a88](https://github.com/icoretech/wootty/commit/5215a88db98f351c9887ac7025ea71cf358fa349))
* **ci:** checksum only release archives ([138b91f](https://github.com/icoretech/wootty/commit/138b91f9000306054c6b91df124f5fe694d15375))
* **ci:** enforce conventional commit subjects for release-please parsing ([ebae2b7](https://github.com/icoretech/wootty/commit/ebae2b78e85a3f34f5727974701f51367b6c7794))
* **ci:** ignore synthetic merge commits in commit subject gate ([2a851b9](https://github.com/icoretech/wootty/commit/2a851b9eb19252b399e756b4e02aaeb74759872e))
* **compose:** avoid profile image tag collisions ([bb79594](https://github.com/icoretech/wootty/commit/bb795940954219d7efb2f04a89d365b610724400))
* **config:** align env defaults and auth behavior with docs ([1428006](https://github.com/icoretech/wootty/commit/142800665d36873f786651bb5a1367730485083d))
* **connection:** surface bootstrap failures as error status ([a460069](https://github.com/icoretech/wootty/commit/a460069f93886573a45ffbb1800423df3a70dfe4))
* **dev:** auto-select free server port when 8080 is busy ([5e05b29](https://github.com/icoretech/wootty/commit/5e05b29904f84a226355996f31a0cf926cea682a))
* **dev:** handle Ctrl+C shutdown without recursive runner noise ([cd60929](https://github.com/icoretech/wootty/commit/cd60929fbde2123302bdfd111fa9285681e12730))
* **dev:** remove lsof dependency from port fallback ([230d4e6](https://github.com/icoretech/wootty/commit/230d4e6dadede1d10f8356aed0e5e42be7a8fef3))
* **docker:** honor WOOTTY_COMMAND in container runtime ([0c03b52](https://github.com/icoretech/wootty/commit/0c03b520424bfaaf6269deeeaad30cf6aa79be01))
* **docker:** include openssh-client in runtime image ([3c629d3](https://github.com/icoretech/wootty/commit/3c629d30a57520553c90de0ed2b2e8781589b928))
* **session:** separate refresh pipeline failures from network errors ([87096fb](https://github.com/icoretech/wootty/commit/87096fb52d60204573a67e186f26a1497e9170c2))
* **session:** stabilize refresh coordinator callback identity ([3f4d6e8](https://github.com/icoretech/wootty/commit/3f4d6e88d94b88b23a7c58577c5c60bac0ef2de8))
* **session:** stop poll retries on terminal bootstrap failures ([4cf69ce](https://github.com/icoretech/wootty/commit/4cf69ce5728839135f1f9297469e94efc432b4f9))
* **transport:** avoid heartbeat ping churn while awaiting pong ([09b0014](https://github.com/icoretech/wootty/commit/09b0014aeec8db816cf5457d7ffbcae197c6963b))
* **web:** align sessions auth failures and env URL route contracts ([f61ad83](https://github.com/icoretech/wootty/commit/f61ad836afe5bcbd38afb4b3ea5c66c920e1eee0))
* **web:** avoid poll refresh starvation from transport-trigger churn ([2e73b80](https://github.com/icoretech/wootty/commit/2e73b808fe389ed15d3aa66ca04bc230c89ebc7a))
* **web:** enforce backend issue code guard against declared union ([68a12b7](https://github.com/icoretech/wootty/commit/68a12b7bad7975fb6f23444732a74b767bf16d79))
* **web:** enforce threshold-based session refresh circuit opening ([7e7a16b](https://github.com/icoretech/wootty/commit/7e7a16bb7750d56a332ab6eb4c9a3945ba56d7be))
* **web:** make session refresh failure flow explicit and request-scoped ([6fa1046](https://github.com/icoretech/wootty/commit/6fa104649d1b30d0d4f61ad1966462e82b508ea7))
* **web:** prevent duplicate transport error and close notices ([7581adc](https://github.com/icoretech/wootty/commit/7581adc4a8c60022132d5df7428177d5f53f486a))
* **web:** rotate transport on ws url change and surface history parse errors ([0737cd7](https://github.com/icoretech/wootty/commit/0737cd771fbdf52af00f703c5dcacde2b9a6a420))
* **web:** use pointer events for session menu outside-dismiss ([9b94ef4](https://github.com/icoretech/wootty/commit/9b94ef4fcc460aec005485a18e43fdf6f47cd040))

## [0.2.2](https://github.com/icoretech/wootty/compare/wootty-v0.2.1...wootty-v0.2.2) (2026-02-20)


### Bug Fixes

* clear terminal viewport when switching sessions ([9861330](https://github.com/icoretech/wootty/commit/98613304640c504d527c17b093c8363fb5556685))

## [0.2.1](https://github.com/icoretech/wootty/compare/wootty-v0.2.0...wootty-v0.2.1) (2026-02-20)


### Features

* refine terminal UX and add watch sessions ([38da078](https://github.com/icoretech/wootty/commit/38da07855e37a8bc2f5a0022b30c467644f8fdc4))
* tune terminal defaults and refresh docs screenshot ([b1b6ce0](https://github.com/icoretech/wootty/commit/b1b6ce0e7a1bc99c6b1508850465c2be1dc73591))

## [0.2.0](https://github.com/icoretech/wootty/compare/wootty-v0.1.1...wootty-v0.2.0) (2026-02-20)


### Features

* package self-contained wootty binary ([5387476](https://github.com/icoretech/wootty/commit/5387476a4b92e435255afc063a1e538d12f28d12))


### Bug Fixes

* dispatch publish-image without git checkout ([65dfb85](https://github.com/icoretech/wootty/commit/65dfb85084f8c3fc2effa79467cf8f42f3a61f19))

## [0.1.1](https://github.com/icoretech/wootty/compare/wootty-v0.1.0...wootty-v0.1.1) (2026-02-19)


### Bug Fixes

* allow manual release-please dispatch ([dbea233](https://github.com/icoretech/wootty/commit/dbea23341d574976e85135bc795ff8b803c16018))

## [Unreleased]

- Initial WooTTY foundation (React 19 terminal client + Go PTY server).
