# Development Plan

- Project: Apple Container Manager for VS Code
- Duration: ~8 weeks
- Team: 1–2 developers + 1 tester
- Starting Version: v0.1 Alpha

---

## 1. Milestones
- M0 (Completed): Validate CLI calls, parse version, system control
- M1 (Completed): TreeView UI, Status Bar, auto-start logic
- M2 (Completed): GitHub version check and update notification
- M3 (Completed): Container operations and Marketplace readiness
- M4 (Completed): Creation Wizard and Log Streaming
- M5 (Completed): Devcontainer workflow support
- M6 (Completed): Testing, optimization, and documentation for v0.5.0 release
- M7 (Completed): Safety, Efficiency (Auto-stop), and UI Polish (v0.6.0 - v0.8.0)
- M8 (Completed): Interactive Auto-Update and Reliability Fixes (v0.8.1)

## 2. Phase Details
### M0: Technical Validation and Foundation
- Call `container --version` and parse output
- Implement `system start|stop|restart`
- Establish CLI wrapper module (child process management and logging)
- Initialize project structure and extension activation logic

### M1: Core UI and Status
- Build Activity Bar view with System, Images, and Containers TreeViews
- Implement container and image list refresh (polling every 5 seconds)
- Show system status and CLI version in Status Bar and System TreeView
- Implement workspace auto-start logic
- Add OutputChannel for logging

### M2: Version Detection and Update Notification
- Detect latest CLI version via GitHub API
- Notify users in “notify” mode and provide a download flow
- Verify download with SHA256 checksum and provide manual install command
- Improve error handling and diagnostics

### M3: Container Operations
- Implement Start, Stop, Restart for containers
- Implement Logs (streamed) and Exec (VS Code terminal)
- Implement Image Pull, Remove, Run
- Finalize toolbar actions and UX polish for operations

### M4: Creation Wizard and Log Streaming
- Implementation of `ContainerCreateWizard` for guided container setup
- Support for selecting images, resources, ports, and volumes
- Introduction of `ContainerLogManager` for streaming container logs
- Enhanced log formatting and timestamp toggles

### M5: Devcontainer Workflow Support
- Logic to parse `.appcontainer/devcontainer.json`
- Support for `build` (Dockerfile/context) and `image` based configs
- Lifecycle hooks: `postCreateCommand`, `postStartCommand`
- Commands to apply, rebuild, and open devcontainers (SSH hints)

### M6: Polish and Release
- Test coverage for core flows and error handling
- Documentation updates (README, help, changelog)
- Prepare and publish preview to Marketplace
- Collect feedback and scope next release

### M7: Automation and Efficiency
- Auto-stop mechanism for idle containers
- Safety confirmations for destructive actions
- Enhanced logging and progress indicators

## 3. Risks and Mitigations
- CLI output changes: Add version detection and capability probing
- Elevated privileges: Use explicit macOS prompts for confirmation
- Download failures: Provide manual steps and clear retry guidance
- macOS compatibility: Detect macOS version and disable unsupported features

## 4. Acceptance Criteria
- TreeView lists images and containers with correct status
- System start and stop work reliably
- Status Bar displays real-time status and CLI version
- New CLI version detection notifies and download flow works as designed
- All CLI actions are logged with clear error messages
- Workspace auto-start logic is idempotent and reliable

## 5. Release Plan
- v0.1 Alpha: Internal validation of CLI calls
- v0.2 Beta: Update detection and system control
- v1.0: Full container management and Marketplace release
- v1.1+: Image build and network visualization enhancements

## 6. Maintenance Plan
- Quarterly review of Apple container CLI changes
- Maintain API compatibility and fix regressions promptly
- Optimize UX and performance based on user feedback
