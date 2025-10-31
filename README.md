# Apple Container Manager for VS Code

A VS Code extension for macOS that provides visual management for Apple’s native container environment (`container` CLI). It enables viewing images and containers, starting and stopping services, viewing logs, and checking for container CLI updates — all without Docker Desktop.

---

## Features
- Activity Bar view: “Apple Containers” with System, Images, and Containers trees
- Images view surfaces repository and tag details for quick version checks, including removal for unused images
- Containers view now supports inline start / stop / remove controls with rich hover summaries (image, CPU / memory, ports)
- Dedicated System view with start / stop controls and update awareness
- One-click “+” toolbar button launches a two-step container creation wizard (image & resources, then ports / volumes / extra args)
- Real-time views that clear stale data and prompt to start the system service when it is offline
- Detects container CLI version, checks GitHub for the latest release, and surfaces inline upgrade actions
- Optional workspace-level auto-start of the system service
- Lightweight, native, no external dependencies

## System Requirements
- macOS 26+ (Apple Silicon)
- Apple `container` CLI installed and available in PATH
- VS Code 1.95+

## Installation
1. Install the extension from a packaged `.vsix` file or the Marketplace (when available).
2. Ensure the Apple `container` CLI is installed and executable (`container --version`).

## Quick Start
1. Open VS Code. The “Apple Containers” view appears in the Activity Bar.
2. If the system service is not running, start it from the System view.
3. Use context menus or the Command Palette to manage containers and images, or create a container from the Containers view toolbar.

## Configuration
Add settings in your user or workspace settings:

```jsonc
{
  "appleContainer.update.mode": "notify",
  "appleContainer.update.checkIntervalHours": 24,
  "appleContainer.system.autoStartOnWorkspaceOpen": false,
  "appleContainer.pollIntervalMs": 5000
}
```

## Commands
- `appleContainer.system.start`: Start the container system service
- `appleContainer.system.stop`: Stop the container system service
- `appleContainer.system.refresh`: Refresh service status and version information
- `appleContainer.container.create`: Launch the container creation wizard
- `appleContainer.container.start`: Start a selected container
- `appleContainer.container.stop`: Stop a selected container
- `appleContainer.container.remove`: Remove a stopped container
- `appleContainer.image.remove`: Remove an unused image
- `appleContainer.containers.refresh`: Refresh the containers list (disabled when the service is stopped)
- `appleContainer.images.refresh`: Refresh the images list (disabled when the service is stopped)
- `appleContainer.refresh`: Refresh all views (System, Images, Containers)
- `appleContainer.system.upgrade`: Open the latest GitHub release for the container CLI
- `appleContainer.update.check`: Check for a new CLI version

## Roadmap (High Level)
- M0: CLI interface validation and system control — in progress
- M1: TreeView, Status Bar, auto-start — planned
- M2: Version detection and download prompts — planned
- M3: Full container operations and Marketplace release — planned

## Troubleshooting
- CLI not found: Verify `container` is installed and on PATH, then restart VS Code.
- Service not running: Use the System view Start action; check Output panel for logs.
- Permission prompts: Elevated operations require explicit user approval via macOS.

## Contributing
Issues and pull requests are welcome. The goal is to make managing macOS native containers as convenient as working with Docker Desktop, directly within VS Code.

## Release Notes
See `CHANGELOG.md` for a versioned history of notable changes.

## License
MIT License © 2025 Apple Container. See `LICENSE` for details.
