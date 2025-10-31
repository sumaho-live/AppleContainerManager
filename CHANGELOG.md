# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
- No unreleased changes.

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

[0.3.1]: https://github.com/sumaho-live/AppleContainerManager/tree/0.3.1
[0.2.7]: https://github.com/sumaho-live/AppleContainerManager/tree/0.2.7
[0.2.6]: https://github.com/sumaho-live/AppleContainerManager/tree/0.2.6
[0.2.5]: https://github.com/sumaho-live/AppleContainerManager/tree/0.2.5
[0.2.4]: https://github.com/sumaho-live/AppleContainerManager/tree/0.2.4
[0.2.3]: https://github.com/sumaho-live/AppleContainerManager/tree/0.2.3
[0.2.2]: https://github.com/sumaho-live/AppleContainerManager/tree/0.2.2
[0.2.1]: https://github.com/sumaho-live/AppleContainerManager/tree/0.2.1
