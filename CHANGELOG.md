# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
- No unreleased changes.

## [0.9.7] - 2026-10-15
### Fixed
- **Devcontainer Build**: `build.dockerfile` and `build.context` are now resolved relative to the folder containing `devcontainer.json`, as the devcontainer spec defines. Previously the context was resolved against the workspace root and the Dockerfile against the context, so a Dockerfile next to `.appcontainer/devcontainer.json` (`"dockerfile": "Dockerfile"`) was looked up at the workspace root and the build failed. Existing configurations that rely on the old workspace-root layout keep working: when the Dockerfile only exists there, it is used and a deprecation warning is logged.
- **Devcontainer Build**: When the Dockerfile cannot be found, the build now stops with a clear `Dockerfile not found: <path>` error instead of a failing `container build` call. `build.dockerfile` defaults to `Dockerfile` when omitted.

## [0.9.6] - 2026-10-15
### Fixed
- **Auto-stop**: The SSH activity check using `ss` filtered on the remote port (`dport`) instead of the local SSH port, so active inbound sessions were never counted and containers were stopped while in use. It now filters on `sport`.
- **Auto-stop**: The monitor now runs as root and keeps its PID file in `/tmp`, so it no longer exits silently (and can power off the container) when `remoteUser` is not root.
- **Container Rebuild**: Rebuilding a container now recreates it with its original configuration (CPU, memory, architecture, published ports, mounts, environment, working directory and command) instead of image and name only. If the configuration cannot be read, the rebuild aborts before anything is removed.
- **Security**: `Initialize DNS` no longer interpolates the domain into the administrator shell command. The domain is validated and passed to AppleScript as an argument with `quoted form of`.
- **Reopen in Container**: The devcontainer was applied twice when the container did not exist yet (running `postStartCommand` twice). It is now applied once, using the already-selected workspace folder.
- **Devcontainer Config**: `devcontainer.json` parsing now supports trailing `//` comments and trailing commas, and no longer treats `//` or `/*` inside strings as comments. Previously such files were reported as "No devcontainer configuration found".
- **SSH**: The SSH public key is only appended to `authorized_keys` when missing, instead of on every reuse of an existing container.
- **Activation**: Commands are registered before CLI detection, so they are available immediately, and a failed initial refresh no longer aborts activation.
- **Updates**: `update.checkIntervalHours` values below 1 fall back to 24 hours instead of polling in a tight loop.
- **Devcontainer Rebuild**: Removed a duplicated stop call.

## [0.9.5] - 2026-06-23
### Fixed
- **Images View**: Fixed a regression where all images showed "unknown" for repository name and incorrect sizes. The newer CLI nests the image reference under `configuration.name` and sizes in `variants[0].size`. Also fixed `getNestedValue()` to traverse array indices (e.g., `variants.0.size`), which was silently failing and returning descriptor-level metadata instead of per-variant data.
- **Containers View**: Fixed container status always showing "unknown" and missing resource/port/platform data. The newer CLI nests status under `status.state`, platform under `configuration.platform`, resources under `configuration.resources`, and ports under `configuration.publishedPorts`. All mapping paths updated with the new structure as first priority, falling back to legacy field names.

## [0.9.3] - 2026-06-23
### Fixed
- **Devcontainer Build**: Fixed a critical bug where `container build` always failed with exit code 64 when using a `build` block (Dockerfile) in `devcontainer.json`. The auto-generated fallback image tag contained stray spaces (`acm / name: dev`), producing an invalid OCI reference. Tags are now properly formatted as `acm/name:dev`.
- **Devcontainer Build**: The fallback image tag is no longer unconditionally appended when the user supplies explicit tags via `build.image`. Users can now provide their own valid image tags as a workaround, though it is no longer necessary.
- **Devcontainer**: Fixed stray spaces in auto-generated container names (`acm - name ` → `acm-name`) and default workspace folder paths (`/ workspaces / name ` → `/workspaces/name`).
- **CLI Compatibility**: Updated `version()` to parse the new `container system version --format json` output, falling back to the legacy `--version` regex if JSON is unavailable.
- **CLI Compatibility**: Updated `getSystemStatus()` to use `container system status --format json` for structured status detection, with table-parsing fallback for older CLI versions.
- **Event Order**: Fixed a double-refresh bug where tree views were triggered twice in rapid succession during system status updates. The `system:status` event now fires after resource refresh completes.

### Changed
- **Code Quality**: Extracted duplicated log severity detection logic into a shared `inferLogSeverity()` utility in `src/core/severity.ts`, eliminating DRY violations between `containerLogs` and `logFormatter`.
- **Code Quality**: Unified `node:` import prefix across all files (fixes inconsistent `child_process` import in `updateManager.ts`).
- **Code Quality**: Fixed `.vscodeignore` to reference `eslint.config.mjs` instead of the stale `.eslintrc.json`.

### Removed
- **Dead Code**: Removed unused `StatusBarManager` class from `src/core/statusBar.ts`.
- **Dead Code**: Removed unrelated `test.js` (basic HTTP server left over from development).

## [0.9.2] - 2026-04-09
### Added
- **Feature**: Adapted to the latest container upgrade command `/usr/local/bin/update-container.sh`. This script is now the preferred method for upgrading the container CLI when available, supporting interactive password prompts.

## [0.9.1] - 2026-03-17
### Added
- **Feature**: Initialize DNS button in the System view. Runs `sudo container system dns create <domain>` and `container system property set dns.domain <domain>` to enable container name resolution (default domain: `container.acm`).
- **Feature**: "Rebuild Container" context menu action for containers. Stops, removes, and recreates the container with the same image and name, registering it in DNS.

### Fixed
- **Auto-Update**: Fixed a critical bug where the installer download would silently fail. The HTTP redirect handler (302) was placed inside the `>= 400` status check block where it could never execute. Now properly handles 301/302/307/308 redirects.
- **Auto-Update**: Added download verification—checks that the installer file exists and has a non-zero size before proceeding with installation.

## [0.8.5] - 2026-01-23
### Added
- **Configuration**: Added support for standard `hostRequirements` object in `devcontainer.json` to define container `cpus` and `memory`.
- **Configuration**: Implemented resource precedence logic: `runArgs` > `hostRequirements` > `Global Defaults`.

### Security
- **Stability**: Improvements to SSH stability on reconnection (kex_exchange_identification).

## [0.8.4] - 2026-01-23
### Changed
- **Stability**: Disabled **Auto-Stop** by default to prevent accidental container termination. Users must explicitly enable it in settings.
- **Stability**: Added a 2-minute startup grace period to the Auto-Stop monitor to prevent premature shutdowns during initialization.

### Added
- **Configuration**: Added `appleContainer.resources.defaultCpus` (default: 4) and `appleContainer.resources.defaultMemory` (default: 8GB) settings. These defaults are applied when a `devcontainer.json` does not specify resource limits.

## [0.8.3] - 2026-01-23
### Changed
- **Stability**: Disabled SSH `ControlMaster` (multiplexing) by default. This resolves `kex_exchange_identification` errors and connection drops caused by unstable forwarding pipes.

## [0.8.2] - 2026-01-23
### Fixed
- **Stability**: Capped container log history to 5000 lines to prevent memory leaks and Extension Host crashes (SIGKILL) during long running sessions.

## [0.8.1] - 2026-01-23
### Changed
- **Auto-Update**: Enhanced interactive update flow:
    - Added "Skip this version" option to suppress notifications for specific releases.
    - Added pre-download confirmation prompts.
    - Implemented a stricter "Stop -> Uninstall -> Install" flow for reliability.
    - Wired the "Check for CLI Updates" command to the new interactive manager.

### Fixed
- **Updater**: Fixed a quoting syntax error in the uninstall script path that caused updates to fail.
- **Linting**: Resolved lint warnings in `autoStopMonitor.ts` and `githubClient.ts`.

## [0.8.0] - 2026-01-15
### Added
- **Feature**: Auto-stop container support. Containers can now be configured to automatically stop after a period of SSH inactivity (default 5 minutes), helping to conserve system resources.
- **Configuration**: Added `appleContainer.autoStop.enabled` and `appleContainer.autoStop.timeout` settings.

## [0.7.1] - 2026-01-15
### Changed
- **Stability**: Added a 15-second timeout to the `exec` command during SSH key injection to prevent hanging.
- **Documentation**: Added a warning to the README about the experimental nature of the extension and potential stability issues.

## [0.7.0] - 2026-01-15
### Added
- **Experience**: "Reopen in Container" status bar item that automatically appears when a devcontainer configuration is detected.
- **UI**: Added `$(remote-explorer)` icon to the status bar button for better visual recognition.

## [0.6.1] - 2026-01-13
### Added
- **Experience**: Added progress indicators for long-running operations (Container Creation, Devcontainer Build/Apply).

## [0.6.0] - 2026-01-13
### Added
- **Safety**: Confirmation dialogs for container and image removal to prevent accidental deletions.
- **Observability**: New "Export Logs..." command to save container logs to a file for debugging or sharing.
- **Devcontainer**: Implemented "run-once" checks for `postCreateCommand` to prevent repeated execution when reusing containers.

### Changed
- Devcontainer `postStartCommand` continues to run on every start, distinct from `postCreateCommand`.

## [0.5.1] - 2026-01-10
### Fixed
- Removed unused variable `sshInjectionCmd` in `devcontainerManager.ts`.

## [0.5.0] - 2026-01-08
### Added
- SSH ControlMaster support for faster terminal connections.
- Automatic collision detection and recreation for devcontainers to apply new configurations.
- Keep-alive (`sleep infinity`) for containers to prevent immediate exit.

### Changed
- Overhauled README with DevContainer guide and troubleshooting tips.

### Fixed
- Resolved issues with zombie containers and false positive "container exists" errors.
- Fixed startup failures by adding strategic delays after CLI operations.

## [0.4.1] - 2025-11-01
### Added
- Devcontainer tooling: apply/rebuild commands that read `devcontainer.json`, recreate containers, and run `postCreate`/`postStart` lifecycle hooks through the Apple CLI.
- `container exec` integration for running ad-hoc commands inside active containers, used by the devcontainer lifecycle manager.
- Image build support that invokes `container build` based on `.appcontainer/devcontainer.json` definitions (Dockerfile, context, args, target, tags).
- New container context actions for running commands or opening an interactive shell.

### Changed
- Documentation now covers the devcontainer workflow and Remote-SSH connection guidance.
- Devcontainer configuration discovery path changed to `.appcontainer/devcontainer.json` (or `.appcontainer.json`) to avoid conflicts with the official Dev Containers extension.
- Increased the default CLI execution timeout to accommodate long-running `container run` operations and avoid premature failures.

### Fixed
- Restored tree view toolbar actions for system, containers, and images after consolidating menu contributions.

## [0.4.0] - 2025-10-31
### Added
- Container log streaming with start/stop controls directly from the Containers view backed by a new `ContainerLogManager`.
- Output channel formatting features including optional timestamps, keyword highlighting, and minimum log level filtering settings.

### Changed
- Plugin log entries now render as plain text without embedded ANSI colour codes while preserving severity tags.
- Container and image tree views clear stale data when the system service stops to avoid showing outdated inventory.

## [0.3.1] - 2025-10-31
### Removed
- Removed the persistent cache for system, container, and image data to avoid stale information when the service is stopped.

### Changed
- Tree views now clear stale entries and surface guidance when the system service is offline.

## [0.2.7] - 2025-10-30
### Added
- Two-step container creation wizard with inline toolbar access from the Containers view.
- Rich container tooltips listing architecture, CPU, memory, ports, and lifecycle metadata.
- Offline cache priming for containers with normalized status messaging when the system service is stopped.

### Changed
- Container view descriptions now surface image references and resource summaries for quicker scanning.

### Fixed
- Ensured containers fall back to cached data if refresh fails while the system is running.

## [0.2.6] - 2025-10-30
### Added
- Inline removal actions for containers and images with context-aware availability.
- CLI support for safe removal commands following stop validation.

### Fixed
- Synchronized restart flows to wait for stop completion before issuing start commands.

## [0.2.5] - 2025-10-30
### Fixed
- Corrected container identifier parsing to target the proper instance for all CLI operations.
- Verified packaging changes in preparation for Marketplace publishing.

## [0.2.4] - 2025-10-30
### Added
- Surfaced container image tags directly in the Images TreeView.

### Changed
- Restart flows now invoke explicit stop followed by start to align with CLI guidance.

## [0.2.3] - 2025-10-29
### Added
- Persistent cache for system, container, and image data with offline fallback behavior.
- Contextual refresh actions and inline start/stop controls for containers.

### Changed
- System view now emits update metadata and hides irrelevant toolbar actions from other views.

## [0.2.2] - 2025-10-28
### Added
- Robust CLI parsers for container and image listings including tags, sizes, and timestamps.
- Dedicated System TreeView for managing Apple container services.
- Enhanced tooltips for container and image entries with networking and lifecycle details.

### Changed
- Documentation refreshed to reflect the new System view and improved metadata fidelity.

## [0.2.1] - 2025-10-28
### Added
- Initial alpha validation for the Apple `container` CLI integration and VS Code extension scaffolding.

[Unreleased]: https://github.com/sumaho-live/AppleContainerManager/compare/0.9.5...HEAD
[0.9.5]: https://github.com/sumaho-live/AppleContainerManager/compare/0.9.3...0.9.5
[0.9.3]: https://github.com/sumaho-live/AppleContainerManager/compare/0.9.2...0.9.3
[0.9.2]: https://github.com/sumaho-live/AppleContainerManager/compare/0.9.1...0.9.2
[0.9.1]: https://github.com/sumaho-live/AppleContainerManager/tree/0.9.1
[0.8.5]: https://github.com/sumaho-live/AppleContainerManager/tree/0.8.5
[0.8.4]: https://github.com/sumaho-live/AppleContainerManager/tree/0.8.4
[0.8.3]: https://github.com/sumaho-live/AppleContainerManager/tree/0.8.3
[0.8.2]: https://github.com/sumaho-live/AppleContainerManager/tree/0.8.2
[0.8.0]: https://github.com/sumaho-live/AppleContainerManager/tree/0.8.0
[0.7.1]: https://github.com/sumaho-live/AppleContainerManager/tree/0.7.1
[0.7.0]: https://github.com/sumaho-live/AppleContainerManager/tree/0.7.0
[0.6.1]: https://github.com/sumaho-live/AppleContainerManager/tree/0.6.1
[0.6.0]: https://github.com/sumaho-live/AppleContainerManager/tree/0.6.0
[0.5.1]: https://github.com/sumaho-live/AppleContainerManager/tree/0.5.1
[0.5.0]: https://github.com/sumaho-live/AppleContainerManager/tree/0.5.0

[0.4.0]: https://github.com/sumaho-live/AppleContainerManager/tree/0.4.0
[0.3.1]: https://github.com/sumaho-live/AppleContainerManager/tree/0.3.1
[0.2.7]: https://github.com/sumaho-live/AppleContainerManager/tree/0.2.7
[0.2.6]: https://github.com/sumaho-live/AppleContainerManager/tree/0.2.6
[0.2.5]: https://github.com/sumaho-live/AppleContainerManager/tree/0.2.5
[0.2.4]: https://github.com/sumaho-live/AppleContainerManager/tree/0.2.4
[0.2.3]: https://github.com/sumaho-live/AppleContainerManager/tree/0.2.3
[0.2.2]: https://github.com/sumaho-live/AppleContainerManager/tree/0.2.2
[0.2.1]: https://github.com/sumaho-live/AppleContainerManager/tree/0.2.1
