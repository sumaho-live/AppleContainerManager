# Development Log

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
