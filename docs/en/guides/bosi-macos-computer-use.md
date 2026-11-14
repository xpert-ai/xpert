---
title: 'Bosi local window control on macOS'
---

[简体中文](/zh-Hans/guides/bosi-macos-computer-use)

On macOS 14 and later, an Assistant with **Local window control** can read the application window you choose for a task, enter text, press buttons, and scroll. You can enable it independently of the cloud computer and local Shell.

The macOS activity island shows the active window and provides a focus-preserving Stop control. [Activity Island for macOS](/en/guides/bosi-macos-island).

## Set up and use window control

1. On first launch, choose your language. Bosi opens the **Local window control** page in that language. Select **Open System Settings** to grant **Screen Recording** and **Accessibility**, then return to Bosi and select **Check permissions**. Reopen Bosi if macOS prompts you. To defer setup, select **Set up later**. You can return to the page under **Settings → Computer Use**.
2. When creating your personal Bosi or a blank Assistant, select **Local window control** and a model that supports vision and tool calling. To add the capability to an existing Assistant, attach the `DesktopComputerUse` middleware to its main agent in Studio, enable `desktop_window_control`, and publish the Assistant.
3. Open a one-to-one chat with that Assistant in Bosi for macOS. For example, open a blank document in TextEdit and ask the Assistant to enter two lines of Chinese in the window you select, then read them back and check the punctuation and line break.
4. Bosi opens a native window chooser showing the Assistant's name, the task, and the available windows. Select a window to share its screenshot and accessible controls with the Assistant's model through Xpert. Select **Cancel** to decline the task.
5. During the task, the chat shows the Assistant's name and the selected window's title. Select **Stop window control** to revoke access immediately. The Assistant can also release the window when it finishes. To review or revoke a granted permission, choose **Manage** beside that permission under **Settings → Computer Use**. Returning to Bosi refreshes the permission status.

## Supported operations

| Tool action        | What it does                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`, `observe` | Return a screenshot of the selected window, the roles, labels and values of its accessible controls, and a snapshot ID. The list of candidate window titles stays in the local chooser. |
| `type`             | Insert Unicode text into a native text field or text area at its current insertion point, replacing the selection if the control has one.                                               |
| `click`, `scroll`  | Invoke the press action on an accessible control, or increment or decrement a vertical scroll bar.                                                                                      |
| `finish`           | Release the native driver and the task's window grant. The next task requires a new window selection.                                                                                   |

The window must be visible and match exactly one accessibility window in the owning process. Bosi blocks further actions if the window closes, the match becomes ambiguous, a modal sheet appears, or a required permission is missing. Bosi omits password fields from the list of accessible controls. The screenshot can still contain anything visible in the selected window. Canvases and games that require pixel-coordinate input fall outside the supported controls.

Bosi allows one window task at a time, for up to five minutes and 40 tool calls. The grant covers one service address, tenant, user, organization, Assistant, chat thread, run, and window. Each input action consumes the latest snapshot and requires an element ID from that snapshot. The Assistant must observe again before its next input action. Duplicate callbacks for the same tool call reuse the recorded result. Stopping the task, switching chats, signing out, quitting Bosi, locking the screen, or putting the Mac to sleep releases the grant.

## Implementation

- The `desktop-computer-use` capability provider declares the model requirements and attaches `DesktopComputerUse` to the main agent. The server issues client tool requests through ChatKit and resumes the run with the result. Each observation reaches the model as a tool message containing text and an image. [Capability provider](https://github.com/xpert-ai/xpert/blob/develop/packages/server-ai/src/xpert-template/capabilities/builtin-capabilities.ts) · [Assistant middleware](https://github.com/xpert-ai/xpert/blob/develop/packages/server-ai/src/xpert-middleware/desktop-computer.middleware.ts)
- The chat checks the current Assistant, thread, and tool call ID before forwarding a request. The Electron main process owns the native chooser, the window grant, the record of duplicate requests, and the driver lifecycle. [Chat integration](https://github.com/xpert-ai/xpert/blob/develop/apps/desktop/src/ChatPanel.tsx) · [Window controller](https://github.com/xpert-ai/xpert/blob/develop/apps/desktop/electron/computer-use/controller.cjs)
- The main process communicates with the bundled Swift helper over private standard input and output pipes. ScreenCaptureKit captures the selected window. Accessibility actions target controls belonging to the selected AX window object, and text goes directly into the application's text control. [Swift driver](https://github.com/xpert-ai/xpert/blob/develop/apps/desktop/native/computer-use/WindowControl.swift) · [Apple ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit) · [Apple AXUIElement](https://developer.apple.com/documentation/applicationservices/axuielement)
- After language selection, Bosi records the pending permission step so setup can resume after a restart. Existing installations can open the same page from Settings. Checking permissions reads their current state. The user opens the macOS authorization flow by selecting **Open System Settings**. [Permission page](https://github.com/xpert-ai/xpert/blob/develop/apps/desktop/src/computer-use/ComputerPermissions.tsx) · [OpenBot 0.69.0 host and driver architecture](https://github.com/nightly-labs/openbot/blob/v0.69.0/docs/architecture/computer-use.md)

## Acceptance on a physical Mac

On November 14, 2026, the team tested a Bosi Electron development build on Apple silicon running macOS 26.5.1, using a local Xpert API, an isolated desktop profile, and a separately published test Assistant. macOS had already granted both permissions to the development host. First-time permission prompts for a signed release on a clean system and execution on a physical Intel Mac remain release checks.

| Check                          | Observed result                                                                                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| First launch                   | A fresh profile went through language selection, window permissions, and sign-in in that order. The permission page reported both native grants.                                                                                                             |
| Model tool calls               | The published Assistant called `start`, `type`, `observe`, and `finish` in order. It entered two lines into the accessibility text area of the selected window and checked the full text from a fresh observation.                                           |
| Desktop chat                   | A separate task ran through the desktop ChatKit client tool handler, the native chooser, and the local driver. The test harness selected the target in Bosi's own chooser.                                                                                   |
| Text and window scope          | An independent read through TextEdit's document interface matched the expected text character for character, including punctuation, the line break, and the end of the text. A second open document retained its original contents.                          |
| Denial, revocation, and replay | On the Mac, the driver rejected a stale snapshot and a request after the task ended. Controller regression tests covered chooser cancellation, replay after stopping, duplicate tool calls, and requests from another organization, chat, Assistant, or run. |

The JSON fixture below preserves the original target filename and Chinese text with Unicode escapes. Decode the JSON before sending the text to the Assistant. The expected value has one line break and ends immediately after the final punctuation mark.

```json
{
  "target": "Bosi-\u7a97\u53e3\u9a8c\u6536-1114.txt",
  "expectedText": "\u4f60\u597d\uff0cBosi\u3002\n\u8fd9\u662f\u6307\u5b9a\u7a97\u53e3\u7684\u4e2d\u6587\u9a8c\u6536\u3002"
}
```

To repeat the check, open two plain-text documents with distinct names in TextEdit. Leave the target empty and record the other document's contents. Ask the Assistant to enter the decoded text in the target, read it back, and finish. Read both documents independently in TextEdit. Compare the target with `expectedText` and the other document with its starting contents. Confirm that **Stop window control** disappears from the chat when the task ends.

## Original implementation plan and acceptance criteria

The plan began in `docs/plans/bosi-macos-computer-use.md` and moved into this feature guide after the physical Mac test.

| Stage                    | Implementation                                                                                                                                                                                                                         | Acceptance criteria                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Assistant capability  | Register the optional `desktop-computer-use` capability, expose it during Bosi setup, and attach its middleware in Studio. Reuse template capability registration, model filtering, and ChatKit client tool interrupts.                | The model receives the tool only when the capability is enabled. Server sandbox, local Shell, and window control can be selected independently.                                    |
| 2. First launch          | Place the system permission page after language selection. Show both current permission states and offer system settings, a status check, and deferred setup. Provide the same page in Settings for existing users.                    | An interrupted setup resumes at the pending step. Completing or skipping the step dismisses it on later launches. Each task still requires its own window selection.               |
| 3. Native execution      | Have Electron hold the grant and forward tool requests for the active Assistant, thread, and run. Share the selected window's screenshot and accessible elements. Address each input action to a control from the current observation. | Reject input when permission is missing, the window is ambiguous or gone, the observation is stale, or the control does not support the action.                                    |
| 4. Session lifecycle     | Bind one run to one window, serialize its operations, handle duplicate requests, and expose a stop control.                                                                                                                            | Stale observations and duplicate submissions cannot insert text twice. A scope change, revocation, exit, or timeout ends access. Another Assistant must obtain its own grant.      |
| 5. End-to-end acceptance | Use an isolated profile, a Chinese text fixture, a fresh TextEdit target, and a separate control document.                                                                                                                             | Record the build, permission state, actual Assistant tool calls, native write, independent readback, replay handling, and revocation. Track outstanding release checks separately. |
