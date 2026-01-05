# iOS Simulator Panel - Implementation Plan

**Created:** 2026-01-04
**Status:** Planning
**Priority:** High
**Effort:** ~3-4 days

## Summary

Add real iOS Simulator integration to VibeFlow IDE as a 3rd panel. Uses xcrun simctl for device management + desktopCapturer for real-time screen streaming. Exposes MCP tools for Claude Code to interact with simulator.

## Architecture Decision

**Layout:** 3-panel horizontal (Terminal 30% | Browser 40% | Simulator 30%)
- Matches existing pattern, minimal code change
- User can resize panels freely with react-resizable-panels
- Simulator panel hidden by default, toggled via button

**Screen Capture:** Hybrid approach
- Primary: desktopCapturer for real-time streaming (~30fps)
- Fallback: xcrun screenshot polling (500ms) if permissions denied
- Optional: iOS Bridge integration for future WebRTC needs

**Device Picker:** Quick boot + full picker
- Toolbar: dropdown to select from available devices
- Boot/shutdown button for current device
- Shows device state (Booted/Shutdown)

## Phases

| # | Phase | Status | Files | Est. |
|---|-------|--------|-------|------|
| 1 | Architecture & Setup | Pending | types, config | 2h |
| 2 | Simulator Manager | Pending | src/main/simulator-manager.ts | 4h |
| 3 | UI Panel Component | Pending | src/renderer/components/simulator-panel.tsx | 4h |
| 4 | Layout Integration | Pending | App.tsx, app.css | 2h |
| 5 | MCP Tools | Pending | mcp-server/index.ts, mcp-bridge.ts | 3h |
| 6 | Testing & Polish | Pending | manual testing | 2h |

## Key Files

**New files:**
- `src/main/simulator-manager.ts` - xcrun simctl wrapper
- `src/renderer/components/simulator-panel.tsx` - UI component
- `src/preload/index.ts` - add simulator API

**Modified files:**
- `src/main/index.ts` - add SimulatorManager, IPC handlers
- `src/main/mcp-bridge.ts` - add simulator commands
- `src/mcp-server/index.ts` - add simulator tools
- `src/renderer/App.tsx` - add 3rd panel
- `src/renderer/styles/app.css` - simulator panel styles

## Quick Reference

```bash
# Test simctl is working
xcrun simctl list --json devices

# Boot iPhone 15 Pro
xcrun simctl boot "iPhone 15 Pro"

# Take screenshot
xcrun simctl io booted screenshot /tmp/sim.png
```

## Success Criteria

1. Simulator panel renders in IDE with device picker
2. Can boot/shutdown simulators from UI
3. Real-time screen streaming at ~20-30fps
4. MCP tools work: simulator_screenshot, simulator_tap, simulator_launch_app
5. No major performance impact on existing panels

## Risks

| Risk | Mitigation |
|------|------------|
| macOS screen recording permission | Fallback to xcrun polling |
| Simulator window not found | Search by name pattern + PID |
| Performance with multiple captures | Throttle frame rate, use requestAnimationFrame |
| Xcode not installed | Graceful error message |

## Phase Details

See phase files for implementation details:
- [Phase 1: Architecture](./phase-01-architecture.md)
- [Phase 2: Simulator Manager](./phase-02-simulator-manager.md)
- [Phase 3: UI Panel](./phase-03-ui-panel.md)
- [Phase 4: MCP Tools](./phase-04-mcp-tools.md)
