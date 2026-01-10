# Development Log

## 2025-10-31 — Devcontainer workflow support

### Summary
- Added `container exec` helpers so lifecycle commands can run inside active containers with user/workdir/env options.
- Introduced a DevcontainerManager that parses `.appcontainer/devcontainer.json`, resolves mounts/ports/env, and orchestrates stop/remove/recreate flows via the Apple CLI.
- Added image build support via `container build`, honoring `dockerfile`, `context`, `args`, `target`, and tagging rules from the devcontainer configuration.
- Registered new VS Code commands to apply/rebuild the devcontainer, re-run lifecycle scripts, and show Remote-SSH connection hints.
- Documented the expected SSH-ready image requirements and updated README/CHANGELOG to walk through the workflow.

### Outstanding Follow-ups
- Track first-run state so `postCreateCommand` only executes once per container build.
- Evaluate supporting devcontainer `features`, image cache controls, and docker-compose projects in future iterations.

## 2025-10-31 — v0.4 release preparation

### Summary
- Bumped the extension version to `0.4.0` and refreshed README/CHANGELOG language to reflect the new logging capabilities.
- Regenerated release notes and verified lint/package workflows in preparation for distributing the new build.
- Captured the log configuration surface (timestamps, keyword highlighting, minimum level) for documentation parity.

### Outstanding Follow-ups
- Publish the packaged `.vsix` and tag the repository with `v0.4.0`.
- Capture usage analytics or user feedback on the revamped logging experience.

## 2025-10-31 — Container log streaming and formatting

### Summary
- Added a ContainerLogManager to stream CLI output with start/stop controls per container, including state preservation in the tree view and automatic cleanup when containers disappear.
- Provided shared formatting for system-level logs while leaving container output raw aside from `[containerId]` tagging, matching the requested minimalist display.
- Removed ANSI colouring from plugin log entries so Output channel lines remain plain text while still conveying tags/levels.
- Introduced user settings to toggle timestamp display, select minimum plugin log level (default `info`), and wired new commands/menus for hover-triggered log viewing.

### Outstanding Follow-ups
- Evaluate adding a history export command to leverage the stored plain-text log entries.
- Consider exposing additional formatting options (custom keyword list, timestamp precision) based on user feedback.

## 2025-10-31 — Removed persistent cache after UX regression

### Summary
- Removed the VS Code global-state cache for system, container, and image data to prevent stale listings when the system service is offline.
- Updated TreeViews to display detection placeholders and guidance to start the service rather than showing cached data.
- Adjusted container creation flows to fetch the latest images via the CLI instead of relying on cached snapshots.
- Tagged the v0.3.1 release and refreshed documentation to note the cache removal.

### Outstanding Follow-ups
- Monitor load/performance after dropping the cache and confirm repeated refreshes remain responsive.
- Gather user feedback on the new offline messaging and tune copy/icons if needed.

## 2025-10-30 — Container creation wizard and UI simplification

### Summary
- Added a two-step container creation wizard (image/resources then networking/storage) with a toolbar shortcut in the Containers view.
- Enhanced container hover tooltips to surface architecture, CPU, memory, and port summaries directly in the tree plus refreshed row descriptions.
- Normalised container status display to “Stopped” whenever the system service is offline and removed restart operations and the status bar badge.
- Updated CLI wrapper to support `container run` with ports, volumes, and additional arguments from the wizard.

### Outstanding Follow-ups
- Evaluate capturing more CLI defaults (env files, entrypoint overrides) in the wizard’s advanced step.
- Investigate persisting recent wizard selections per workspace for quicker repeated container creation.

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
- Former follow-up to store additional cache metadata is obsolete after the cache removal change above.
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

## 2026-01-08 — v0.5.0 Release: Seamless DevContainer Workflow

### Summary
- Released **v0.5.0** focusing on "Open in Container" usability.
- **Improved Connection**: Implemented SSH ControlMaster (multiplexing) to virtually eliminate terminal latency.
- **Robust Provisioning**:
    - Added collision detection: outdated containers are automatically removed and recreated to ensure new configurations (ports, volumes) are applied.
    - Added keep-alive logic: containers now start with `sleep infinity` to prevent immediate exit on standard images (like `node:18`).
    - Added race condition mitigation: strategic delays after CLI operations ensure state consistency.
- **Documentation**: Overhauled README to feature the DevContainer guide and troubleshooting tips.
- **Bug Fixes**: Resolved issues with zombie containers, "container exists" false positives, and startup failures.

### Outstanding Follow-ups
- Explore broader image support and performance tuning for larger projects.
- Evaluate automated testing for the full SSH workflow.

## 2026-01-10 — Maintenance and Documentation

### Summary
- Fixed code linting issues (removed unused variable in `devcontainerManager.ts`).
- Updated `CHANGELOG.md` to catch up with v0.5.0 release details and document recent fixes.
