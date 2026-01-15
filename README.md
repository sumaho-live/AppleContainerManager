# Apple Container Manager for VS Code

A VS Code extension for macOS that provides visual management for Apple’s native container environment (`container` CLI). It enables viewing images and containers, starting and stopping services, viewing logs, and checking for container CLI updates — all without Docker Desktop.

---

## Features
- Activity Bar view: “Apple Containers” with System, Images, and Containers trees
- **Status Bar**: "Reopen in Container" button for quick access to devcontainer workflows
- Images view surfaces repository and tag details for quick version checks, including removal for unused images
- Containers view now supports inline start / stop / remove controls with rich hover summaries (image, CPU / memory, ports)
- Opt-in log streaming per container with hover action, configurable timestamps, severity filters, and inline keyword highlighting in the Output channel
- Dedicated System view with start / stop controls and update awareness
- One-click “+” toolbar button launches a two-step container creation wizard (image & resources, then ports / volumes / extra args)
- Real-time views that clear stale data and prompt to start the system service when it is offline
- Detects container CLI version, checks GitHub for the latest release, and surfaces inline upgrade actions
- Optional workspace-level auto-start of the system service
- Devcontainer workflows: seamless "Reopen in Container" experience using `.appcontainer/devcontainer.json`. Automatically handles SSH key injection, config management, and connection.

## System Requirements
- macOS 26+ (Apple Silicon)
- Apple `container` CLI installed and available in PATH
- VS Code 1.95+
- **Remote - SSH** extension installed

## Installation
1. Install the extension from a packaged `.vsix` file or the Marketplace (when available).
2. Ensure the Apple `container` CLI is installed and executable (`container --version`).

## Quick Start
1. Open VS Code. The “Apple Containers” view appears in the Activity Bar.
2. If the system service is not running, start it from the System view.
3. Use context menus or the Command Palette to manage containers.

## DevContainer Support (Open in Container)

The extension enables a full DevContainer-like experience using Apple native containers.

### Prerequisites
- A project with a `.appcontainer/devcontainer.json` file.
- The **Remote - SSH** extension installed in VS Code.

### Configuration (`devcontainer.json`)

Example configuration:

```json
{
  "name": "NodeJS-Dev",
  "image": "docker.io/library/node:18",
  "remoteUser": "root",
  "workspaceFolder": "/root/workspace",
  "forwardPorts": [8080, "2222:22"],
  "postCreateCommand": "apt-get update && apt-get install -y openssh-server && mkdir -p /run/sshd",
  "postStartCommand": "/usr/sbin/sshd"
}
```

> **Note:** Standard images (like `node:18`) usually need SSH installed and started. You must also forward a port to `22` (e.g., `2222:22`) so the host can connect.

### How to Use
1. Open your project folder in VS Code.
2. Run the command **Apple Container: Reopen Folder in Container**.
3. The extension will automatically:
   - Create and configure the container properly.
   - Inject a dedicated SSH key.
   - Update your local `~/.ssh/config` (with optimizations like multiplexing).
   - Ensure the container stays running (injects `sleep infinity` keep-alive).
   - Open a new VS Code window connected via SSH.

### Features
- **Fast Connections:** Uses SSH ControlMaster (multiplexing) for low-latency terminal performance.
- **Port Forwarding:** Respects `forwardPorts` (e.g., map local `2222` to container `22` for SSH, plus app ports).
- **Auto-Provisioning:** Handles SSH keys and config automatically—no manual setup required.
- **Resiliency:** Handles container re-creation on config changes and robustly manages lifecycle states.

## Configuration
Add settings in your user or workspace settings:

```jsonc
{
  "appleContainer.update.mode": "notify",
  "appleContainer.update.checkIntervalHours": 24,
  "appleContainer.system.autoStartOnWorkspaceOpen": false,
  "appleContainer.pollIntervalMs": 5000,
  "appleContainer.logs.showTimestamps": true,
  "appleContainer.logs.highlightKeywords": true,
  "appleContainer.logs.minimumLevel": "info"
}
```

## Commands
- `appleContainer.system.start`: Start the container system service
- `appleContainer.system.stop`: Stop the container system service
- `appleContainer.system.refresh`: Refresh service status and version information
- `appleContainer.container.create`: Launch the container creation wizard
- `appleContainer.container.start`: Start a selected container
- `appleContainer.container.stop`: Stop a selected container
- `appleContainer.container.logs.start`: Begin streaming logs for a running container to the Output panel
- `appleContainer.container.logs.stop`: Stop streaming logs for a running container
- `appleContainer.container.remove`: Remove a stopped container
- `appleContainer.image.remove`: Remove an unused image
- `appleContainer.containers.refresh`: Refresh the containers list (disabled when the service is stopped)
- `appleContainer.images.refresh`: Refresh the images list (disabled when the service is stopped)
- `appleContainer.refresh`: Refresh all views (System, Images, Containers)
- `appleContainer.system.upgrade`: Open the latest GitHub release for the container CLI
- `appleContainer.update.check`: Check for a new CLI version
- `appleContainer.devcontainer.build`: Build the image defined in `.appcontainer/devcontainer.json`
- `appleContainer.devcontainer.apply`: Apply the workspace `devcontainer.json` and recreate the container
- `appleContainer.devcontainer.rebuild`: Force a rebuild of the devcontainer-managed container
- `appleContainer.devcontainer.runPostCommands`: Re-run `postCreateCommand` and `postStartCommand` inside the container
- `appleContainer.devcontainer.open`: Show Remote-SSH connection instructions inferred from `forwardPorts`

## Roadmap (High Level)
- M0: CLI interface validation and system control — in progress
- M1: TreeView, Status Bar, auto-start — in progress
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
