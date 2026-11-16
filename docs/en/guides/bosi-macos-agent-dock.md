---
title: 'Agent Dock for macOS'
---

[简体中文](/zh-Hans/guides/bosi-macos-agent-dock)

Agent Dock gives Bosi users a column of shortcuts along the edge of the display. Selecting an Assistant opens its latest individual conversation when one is available. Selecting a group opens its existing shared conversation in Bosi. For window-control status, the Stop action, and pending requests at the top of the display, see [Activity Island for macOS](/en/guides/bosi-macos-island).

## Using the Dock

1. Sign in to Bosi on macOS 14 or later and select an organization. The Dock appears at the right edge of the display containing the main window. It initially shows up to three Assistants, with pinned Assistants first.
2. Click **+** to choose shortcuts. Click an Assistant or a group to add or remove it, then click **Done**. The choices belong to the current server, tenant, user, and organization on this Mac. The indicator on an avatar shows unread activity or an active Assistant run.
3. Drag the curved handle below **+** to move the Dock up or down the screen edge. Release it to save the height for this display. Bosi restores that position when it restarts.
4. Open **Settings → Agent Dock** to change the screen edge, turn on automatic hiding, or turn off the Dock. Save the settings. With automatic hiding enabled, move the pointer to the edge strip to reveal the shortcuts and handle. Moving away retracts the panel.
5. Hovering leaves the foreground application in control. A deliberate click on a shortcut brings Bosi forward. The shortcut picker and the Dock run in a nonactivating panel. The Dock hides during lock and sleep.

## Settings

Choose **Above other apps** to place the Dock on the screen edge, or **In the Bosi window** to attach it to the main window. Above other apps, you can follow the main window, select the primary display, select a specific display, or show a Dock on every display. If a selected display disconnects, its Dock follows the main window until the display reconnects.

The size slider changes the screen Dock. A window-attached Dock follows the main window’s zoom. Enable automatic hiding to choose whether the edge strip remains visible. A colored wave on the strip indicates a question from a selected Assistant. Enable **Show completed work** to briefly see the latest reply beside the Dock. Clicking the preview opens that thread. If the reply has no available text, the preview uses the conversation title.

Save behavior and display changes with **Save settings**. Assistant switches in this page and the Dock’s **+** picker change the same organization-scoped list immediately.

## Native behavior

The main process positions the Dock in the display work area and accounts for multiple displays and scale changes. The panel uses a separate sandboxed preload and an in-memory Electron session. Its renderer receives display information and opaque action identifiers. The host validates the sender, current account and selection before navigation. Group shortcuts are checked against a fresh membership-scoped list. The main Bosi window creates the ordinary authenticated ChatKit session.

The screen-edge placement, three initial shortcuts, curved shoulders, stacked avatars and spring reveal follow the installed Nightly Labs OpenBot 0.69.0 Agent Dock. Bosi implements the panel and its navigation locally. The shortcut opens the conversation in the main window. [OpenBot Agent Dock](https://github.com/nightly-labs/openbot/blob/v0.69.0/packages/ui/src/features/agent-dock/AgentDock.tsx) · [OpenBot placement and preferences](https://github.com/nightly-labs/openbot/blob/v0.69.0/src/renderer/src/features/agent-dock/agent-dock-preference.ts).

## Verification

The local Electron build ran on an Apple silicon Mac with macOS 26.5.1. A signed-in account supplied the real Assistants and group conversations. The panel appeared at the right edge, moved to the left, retracted to a six-point edge strip, and opened in response to a system mouse event. TextEdit remained frontmost while hovering. Clicking an Assistant selected its conversation in Bosi. Selecting a group opened its ChatKit conversation and marked that group as current in the sidebar.

A separate Electron restart check used a local API fixture and an isolated profile. A newly launched process restored the chosen edge, automatic hiding and a fourth shortcut added by the user. Disabling the Dock hid the native panel.

Quartz mouse events moved the handle on both screen edges, reached the top of the work area and opened the shortcut picker with **+**. After a restart the Dock restored its vertical position, and dragging worked after revealing the hidden strip. On macOS 26.5.1 with Electron 44.4.5, TextEdit stayed in front during the drag, but releasing the handle could activate Bosi. The desktop regression suite reported 510 passed and 24 skipped.

The settings acceptance run exercised two physical displays using a local API fixture. Both displays had independently placed panels at the selected size. Switching to window placement attached one panel to Bosi. The selection list synchronized with the Dock picker, a pending question animated the edge strip, and a completed thread briefly showed its latest reply. A fresh Electron process restored the display settings. The desktop test suite reported 512 passed and 24 skipped.
