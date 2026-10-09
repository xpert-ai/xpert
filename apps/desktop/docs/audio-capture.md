# Desktop audio capture for plugin Views

Desktop owns device access, audio conversion, encrypted buffering and delivery. The plugin owns its records, transcription, summarization and document workflows. The host does not inspect application fields in callback context.

The first version records microphone and system audio together on macOS 15+. Other platforms return `supported: false` from state and reject start. Each track produces 24 kHz mono PCM16 WAV chunks approximately every five seconds, with relative millisecond timestamps and per-track sequence numbers. The host never registers a screen-image output.

## Commands

Declare the commands in the requesting View's `clientCommands`. Call through ChatKit's existing `invokeClientCommand` bridge. Types and validators are exported by `@xpert-ai/desktop-protocol`.

| Command                       | Payload                                                | Behavior                                                                                              |
| ----------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `desktop.audio.capture.start` | `{ delivery: { eventAction, chunkAction, context? } }` | Authorizes callbacks, creates a capture, then starts devices after a user gesture.                    |
| `desktop.audio.capture.state` | `{ captureId? }`                                       | Returns this View's active or pending capture; without an id selects the active/latest local capture. |
| `desktop.audio.capture.stop`  | `{ captureId }`                                        | Stops that capture and flushes remaining audio for delivery. Works offline.                           |
| `desktop.audio.capture.retry` | `{ captureId }`                                        | Resumes delivery of cached data; never starts devices.                                                |

`userActivated` is command-envelope context supplied by ChatKit, not part of payload. The host validates it separately from scope and callback authorization. Only one capture or voice call may own the devices at a time.

`eventAction` must be an `invoke` action without file transport; `chunkAction` must be an `invoke` action with `transport: 'file'`. Both must belong to the same authenticated View. No arbitrary URL or filesystem path is accepted. The host pins the declaring plugin identity and rechecks it before background delivery or retries.

`context` is optional opaque JSON (at most 8 KiB, nesting at most ten levels). The plugin may put an application reference in it and must validate it in its own callbacks. A new capture receives a host-generated `captureId`. Persist the relationship between that id and application records in the plugin's `created` callback.

## Callback contract

All callbacks use the View action `input` field. They receive `version: 1`, `captureId`, and the original `context` if supplied.

The event action receives:

- `created`: `eventId`, `createdAt`, `tracks`. Acknowledge only after durably creating or associating application records. Devices start after this acknowledgement.
- `started`: `eventId`, `startedAt`. Signals that the native helper started. This event is delivered before any audio chunk.
- `stopped`: `eventId`, `durationMs`, `reason`, `chunks` and `errorCode`. Delivered after every cached chunk has been acknowledged, including tail chunks emitted during stop. This is where a plugin can request final processing.

The file action receives a WAV file named `audio.wav` plus `track`, `sequence`, `startMs`, `endMs`, `sha256`. Acknowledge with `{ success: true }` only after durable handling or durable enqueueing. Action return data stays inside the host and is not part of the capture state.

Delivery is **at least once**. Events have stable `${captureId}:${event}` identifiers; chunks are identified by `(captureId, track, sequence)` and content hash. Callbacks must be idempotent, including after a timeout where the server may already have accepted data. Ordering between the two tracks is not guaranteed; use timestamps to assemble a timeline.

## Lifecycle and recovery

Audio and metadata are encrypted with AES-GCM under the Desktop user-data `audio-capture/` directory; the encryption key is protected by Electron `safeStorage`. Cache paths are scoped by API, tenant, organization, user, Assistant and View. Audio is removed after acknowledged delivery and the session cache after the final acknowledgement.

Capture survives View/tab unmounting. Window close, sleep, quit, device loss and the four-hour limit stop devices and retain recoverable audio. Account/configuration changes also cancel in-flight starts and retain the old scope's buffered data; delivery can resume only after returning to that scope and explicitly retrying. A failed start after an ambiguous callback response may leave a pending capture, recoverable using state/retry. The host does not silently resume recording after a restart.

Desktop state exposes capture status, elapsed time, track levels and pending chunk count. It does not expose raw audio, callback context, account identifiers or application records to another View. If capture or its final event is pending, the plugin must not claim final processing has completed.

## Verification and integration

- `corepack pnpm --filter @xpert-ai/desktop test` exercises the JS controller, renderer bridge and existing Desktop behavior without recording real audio.
- `corepack pnpm --filter @xpert-ai/desktop test:audio-native` builds a universal macOS helper and tests conversion using synthetic CMSampleBuffers. It does not request microphone permission.
- `corepack pnpm --filter @xpert-ai/desktop build` builds the helper, checks renderer types and bundles the app.

This is a new capability contract. Consumers of earlier application-specific prototype commands must migrate their View manifest, callbacks and capture-id mapping; there is no application-specific compatibility branch in Desktop. Actual microphone/system capture and OS permission prompts still require live acceptance after the consumer plugin is integrated.
