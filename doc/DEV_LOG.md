# Development Log

## 2025-10-30 — Removal actions and restart guard

### Summary
- Added inline container/image removal commands with context-aware availability (containers must be stopped, images must be unused) and CLI support for the delete operations.
- Ensured container restart waits for the stop operation to settle before triggering start to avoid transient CLI errors.
- Surfaced image usage tracking in the Images view so tags indicate when an image is locked by a running container.

### Outstanding Follow-ups
- Consider prompting for confirmation before destructive actions and exposing undo guidance in documentation.

## 2025-10-30 — Container identifier fix

### Summary
- Corrected container listing to read identifiers from configuration metadata so start/stop/restart actions target the actual container instead of a fallback ID.
- Bumped the VS Code extension version and verified packaging to prep the new build.

### Outstanding Follow-ups
- Watch for additional CLI schema variations (e.g., nested identifier fields) during broader testing to ensure IDs remain stable.

## 2025-10-30 — Image tags and restart flow

### Summary
- Surfaced container image tags directly in the Images view listings for quicker identification of versions referenced by the CLI.
- Changed container restarts to invoke an explicit stop followed by start to mirror the CLI guidance.

### Outstanding Follow-ups
- Monitor CLI changes for additional metadata fields that should appear alongside repository/tag details.

## 2025-10-29 — Cached data and inline container controls

### Summary
- Added a persistent cache backed by VS Code global storage for system version, container, and image lists; TreeViews fall back to cached data when the service is stopped.
- Toggled Images/Containers refresh actions based on system runtime state and hid update-check toolbar buttons from those views.
- Surfaced inline hover actions (start/stop/restart) for containers with automatic refresh and cache updates after operations.
- Extended the CLI wrapper with container start/stop/restart commands and replaced system restart with an explicit stop-then-start flow.
- Wired System view status events to include GitHub release metadata and persist the latest version for offline display.

### Outstanding Follow-ups
- Evaluate storing additional metadata in the cache (e.g., timestamps) for richer offline messaging.
- Add removal/pull operations and expand hover actions as subsequent milestones unlock CLI support.

## 2025-10-28 — Iteration on M0/M1 (alpha build)

### Summary
- Added resilient parsers for `container` CLI output (JSON or table) so image and container names populate correctly.
- Surfaced image tags, sizes, and creation timestamps in the Images TreeView tooltips.
- Surfaced container image references, port mappings, and lifecycle details in the Containers TreeView tooltip/description.
- Introduced a dedicated System TreeView for managing the Apple container system service, removing system controls from the Images/Containers toolbars.
- Adjusted documentation (README, Product Design, Development Plan) to reflect the new System view and improved data fidelity.
- Updated CLI integration to align with `container ls -a` and `container image ls`, capturing digest, architecture, address, CPU, and memory details for display.

### Outstanding Follow-ups
- Validate port mapping parsing against real CLI output and adjust formatting if additional columns exist.
- Wire container/image context menus for operational commands (start/stop, pull/remove) per M2/M3 scope.
- Capture runtime health metrics when the CLI exposes richer status information.
