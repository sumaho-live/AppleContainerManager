# Development Plan

- Project: Apple Container Manager for VS Code
- Duration: ~8 weeks
- Team: 1–2 developers + 1 tester
- Starting Version: v0.1 Alpha

---

## 1. Milestones
- M0 (0.5 weeks): Validate CLI calls, parse version, system control
- M1 (2 weeks): TreeView UI, Status Bar, auto-start logic
- M2 (2 weeks): GitHub version check and update notification
- M3 (2 weeks): Container operations and Marketplace readiness
- M4 (1 week): Testing and documentation

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

### M4: Polish and Release
- Test coverage for core flows and error handling
- Documentation updates (README, help, changelog)
- Prepare and publish preview to Marketplace
- Collect feedback and scope next release

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
