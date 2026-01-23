# Apple Container Manager for VS Code

**Use Apple Container as a Dev Container in VS Code.**

This extension brings the authentic **DevContainer experience** to macOS's native `container` environment. It handles all the complexity—SSH key injection, config management, and lifecycle handling—so you can just open your project and code, exactly like you do with Docker.

> [!TIP]
> If you experience container hanging or repeated SSH interruptions, please try increasing the container's memory and CPU resources first.

> [!WARNING]
> Apple Container is currently in active development. You may experience SSH connection interruptions or unresponsive containers, which in severe cases could lead to **data loss**. This is not an issue with the extension itself. We are continuously working on solutions. If you have any workaround or suggestions, please [submit an issue](https://github.com/sumaho-live/AppleContainerManager/issues).

---

## Key Feature: Dev Containers
Transform any folder into a native Apple Container environment with a simple `.appcontainer/devcontainer.json`.
- **Seamless**: "Reopen in Container" just works.
- **Configurable**: Define `image`, `forwardPorts`, `cpus`, `memory`, `postCreateCommand`, and more.
- **Fast**: Uses native macOS virtualization and SSH multiplexing for near-native performance.
- **Zero-Setup**: Automatically generates SSH keys and manages connection configs.

## Other Features
- Activity Bar view: system, images, and containers management
- **Status Bar**: Quick access to "Reopen in Container"
- Images view surfaces repository and tag details for quick version checks, including removal for unused images
- Containers view now supports inline start / stop / remove controls with rich hover summaries (image, CPU / memory, ports)
- Opt-in log streaming per container with hover action, configurable timestamps, severity filters, and inline keyword highlighting in the Output channel
- Dedicated System view with start / stop controls and update awareness
- One-click “+” toolbar button launches a two-step container creation wizard (image & resources, then ports / volumes / extra args)
- Real-time views that clear stale data and prompt to start the system service when it is offline
- **Auto-Update**: Detects new CLI versions, offering an interactive "Stop -> Uninstall -> Install" flow with "Skip this version" capability.
- Optional workspace-level auto-start of the system service
- **Auto-stop**: Configurable timeout to automatically stop containers when SSH sessions disconnect, saving resources.

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
  "postStartCommand": "/usr/sbin/sshd",
  "hostRequirements": {
    "cpus": 4,
    "memory": "8GB"
  }
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
  "appleContainer.update.autoUpdate": false,
  "appleContainer.update.keepData": true,
  "appleContainer.system.autoStartOnWorkspaceOpen": false,
  "appleContainer.pollIntervalMs": 5000,
  "appleContainer.logs.showTimestamps": true,
  "appleContainer.logs.highlightKeywords": true,
  "appleContainer.logs.showTimestamps": true,
  "appleContainer.logs.highlightKeywords": true,
  "appleContainer.logs.minimumLevel": "info",
  "appleContainer.autoStop.enabled": false,
  "appleContainer.autoStop.timeout": 5,
  "appleContainer.resources.defaultCpus": 4,
  "appleContainer.resources.defaultMemory": "8GB"
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
