# Product Design Specification

- Project: Apple Container Manager for VS Code
- Product Owner: TBD
- Version: v0.4

---

## 1. Product Goals
Provide visual management of macOS native containers within VS Code. Users can start and stop services, view logs, manage images, and get CLI update notifications without leaving the editor.

## 2. Primary User Scenarios
- Daily Developers
  - Use native containers as an alternative to Docker Desktop for local environments
  - View container logs within the editor
- System Engineers
  - Manage multiple images and containers and control the system service
  - Check container CLI versions and update status
- Team Leads / Architects
  - Define `devcontainer.json` configurations for consistent team environments
  - Share project-specific container setups via version control

## 3. Core Design Principles
- Activity Bar: Add an “Apple Containers” icon with three TreeViews: System, Images, and Containers
- TreeView: Dynamically load lists; icons indicate status (running or stopped)
- Toolbar: Start / Stop / Restart System and Check Update
- Status Bar: Show system status and CLI version
- Update Mechanism: Notify latest version; manual installation workflow
- Workspace Auto-start: Per-workspace setting to auto-start the system service

## 4. UI Prototype (Concept)
- Activity Bar
  - Apple Containers
    - System
      - System Service: Running · v0.6.0
    - Images
      - alpine:latest
      - ubuntu:22.04
    - Containers
      - web-server (running)
      - db-server (stopped)
- Toolbar
  - Refresh, Check Updates (system actions live in System TreeView)
- Status Bar
  - Apple Container: Running · v0.6.0

## 5. Interaction Design
- System control: System TreeView context menu and Status Bar call `container system start|stop|restart`
- Container actions: Context menu provides Start, Stop, Restart, Logs, Exec, Shell
- Container Creation: Two-step wizard to configure image, resources, ports, and volumes
- Image actions: Context menu provides Pull, Remove, Run
- Devcontainers: Support for `.devcontainer.json` (via `.appcontainer/devcontainer.json`) to define reproducible environments
- Updates: Toolbar or Command Palette calls GitHub API and notifies if newer
- Updates: Toolbar or Command Palette calls GitHub API and notifies if newer
- Auto-start: Workspace setting triggers idempotent `system start` when opening
- Auto-stop: Background monitor shuts down container after configured SSH inactivity timeout

## 6. Errors and Status Feedback
- CLI not installed: Show guidance with installation steps
- System not running: Provide Start System action and an informational banner
- Command errors: Emit detailed logs to an OutputChannel
- Update failure: Provide manual steps and copyable commands

## 7. Performance and Security
- Polling interval defaults to 5 seconds, with debounced refresh
- All CLI operations spawn child processes to avoid blocking the extension host
- Download integrity: Validate SHA256 where applicable
- No automatic elevation: Always require explicit user confirmation for privileged actions

## 8. Non-Goals
- Remote host management
- Docker Compose-level orchestration
- Automatic installation of the CLI or dependencies

## 9. Future Extensions
- Container network visualization
- Image build, tag, and push
- Automatic health checks and restarts
