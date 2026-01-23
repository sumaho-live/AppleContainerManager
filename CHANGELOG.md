# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
- No unreleased changes.

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

[Unreleased]: https://github.com/sumaho-live/AppleContainerManager/compare/0.8.1...HEAD
[0.8.1]: https://github.com/sumaho-live/AppleContainerManager/tree/0.8.1
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
