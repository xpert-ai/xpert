---
title: 'Activity Island for macOS'
---

[简体中文](/zh-Hans/guides/bosi-macos-island)

On macOS 14 or later, Bosi shows Assistant activity at the top of the screen. While working in another app, you can stop an Assistant from operating a window or open a conversation that needs your input. The island follows your current Bosi connection, account, and organization.

## Stop window control

When an Assistant is using a window you selected, **Stop** appears on the island. Hover over the island to see the Assistant, application, and window title. Click **Stop** to revoke the current window grant immediately. The foreground app keeps keyboard focus, so you can continue typing in the same field. **Stop** stays available when pending conversations also appear. For window selection and system permissions, see [Computer Use on macOS](/en/guides/bosi-macos-computer-use).

## Review pending conversations

The badge on the right counts private Assistant threads waiting for an answer or an approval. When all pending threads belong to one Assistant, the header shows its avatar and short name. When several Assistants have pending threads, it shows the Bosi icon and **To do**. The count stays aligned to the right as it gains digits.

1. Hover for a moment to see up to three threads, most recently updated first. Each row shows the responsible Assistant’s avatar and full name, alongside **Answer a question** or **Review approval**.
2. Select a row to bring Bosi forward and open that exact thread. The question or approval details appear in the original chat.
3. Answer or review the request there. Opening the thread alone leaves it pending. Once the request is resolved, the next activity refresh updates the count and preview.

Moving the pointer away collapses details opened by hover. Clicking the avatar or count on a collapsed island keeps the details open until you click again or select a thread. When an Assistant is running and there are no pending requests or window controls, its name and an activity indicator appear in the header.

## Settings and displays

Open **Settings → Activity Island**. Use **Save settings** to apply your changes.

| Setting                          | Default   | Effect                                                                                                                                                       |
| -------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Show status at the MacBook notch | On        | Shows the island on the display with a notch. If none has a notch, Bosi uses the built-in display when available, then the primary display.                  |
| Show the island when idle        | Off       | Shows the Bosi icon and a greeting between tasks while signed in.                                                                                            |
| Show on additional displays      | Off       | Shows an island on every connected display. Each display responds independently to hovering and expansion.                                                   |
| Force Touch feedback             | On        | Provides tactile feedback for island interactions on a compatible trackpad.                                                                                  |
| Width and Height                 | 100% each | Adjust width from 60% to 125% and height from 75% to 125%. Preview both display shapes in Settings, or choose **Reset size** to return both sliders to 100%. |

On a notched display the header leaves the camera housing clear. On a flat display the island floats just below the top edge. The island hides when the Mac locks or sleeps. Shortcuts along the screen edge have their own settings. See [Agent Dock for macOS](/en/guides/bosi-macos-agent-dock).

## Implementation

- The Electron main process owns a nonactivating panel for each selected display. The Stop action carries the grant ID captured on press. The controller verifies it before revocation, so a delayed click cannot revoke a subsequent grant. [Island panel](https://github.com/xpert-ai/xpert/blob/develop/apps/desktop/electron/activity-island/panel.cjs) · [Window controller](https://github.com/xpert-ai/xpert/blob/develop/apps/desktop/electron/computer-use/controller.cjs)
- The server ranks pending threads across Assistants and reports the full count separately from the preview. The panel sends an opaque key when a row is selected. The host refreshes activity and checks that the row still belongs to the current scope before opening the thread. [Pending thread query](https://github.com/xpert-ai/xpert/blob/develop/packages/server-ai/src/chat-conversation/pending-thread-activity.ts) · [Island panel](https://github.com/xpert-ai/xpert/blob/develop/apps/desktop/electron/activity-island/panel.cjs)
- The renderer animates the notched outline, header, and details inside a stationary native window. Reversing direction mid-hover resumes from the current geometry. The shadow follows the outline, clicks in its transparent margin reach the underlying app, and the renderer respects the system’s reduced-motion preference. [Interaction](https://github.com/xpert-ai/xpert/blob/develop/apps/desktop/electron/activity-island/island.js) · [Geometry and motion](https://github.com/xpert-ai/xpert/blob/develop/apps/desktop/electron/activity-island/island.css)

## Verified behavior

- **Stop and focus.** In a development build on Apple silicon running macOS 26.5.1, a published Assistant entered two lines of Chinese into the selected TextEdit document and read them back. In a separate host check, a native mouse click on **Stop** left TextEdit frontmost with the same document and text area focused throughout 160 focus samples. The host rejected subsequent input and a new start for the stopped run. Independent readback confirmed the target and control documents retained their expected contents.
- **Pending threads.** A live Assistant question opened the correct thread from another Assistant’s chat and cleared after the answer. Desktop regression tests covered approval routing and stale actions. In separate Electron checks with fixture activity, the header correctly showed multiple Assistants even when one owned all three preview rows. Images, emoji, and fallback avatars appeared beside their respective rows.
- **Displays and motion.** On the built-in notched screen and an external flat screen, the island returned to its compact shape after rapid pointer reversals. The native window stayed stationary. Reduced motion applied the final geometry immediately. The badge kept a 12-point right inset as the count grew from one to two digits.

These checks used the local Electron development build. Signed distribution builds and physical Intel Macs remain outside the recorded verification.
