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

### macOS audio permissions and release signing

Native startup has a 60-second deadline from helper launch. After the helper reports `started`, each track has a fresh 15-second first-frame window; subsequent frames renew that track's 15-second input deadline, including zero-level audio. Startup and input timeouts are delivered as `audio_start_timeout` and `audio_input_timeout` respectively. Device initialization must not consume the first-frame window.

The native helper reports a system-audio startup timeout after 20 seconds. It listens for parent stop/EOF before starting devices; shutdown is queued after pending device initialization. Cancellation cannot interrupt a synchronous OS device call: if it remains blocked, Desktop kills the helper after the seven-second shutdown deadline. Late completion callbacks cannot resume an already completed continuation or admit samples after cancellation. Native lifecycle tests simulate a blocked serial device queue; controller tests cover a helper that ignores stop entirely.

The helper captures system audio with a private Core Audio process tap and the default microphone with AVFoundation's `AVCaptureAudioDataOutput`. It creates no ScreenCaptureKit session or screen output. The aggregate device uses the default output device as its clock, with physical input channels excluded and tap auto-start disabled, so startup does not wait for another application to play sound. The tap is unmuted and does not change the system's default device. Tap, IO callback and aggregate device are owned by this process and explicitly destroyed at stop, including partial initialization failures.

Device configuration and shutdown use a separate serial queue. The realtime tap callback copies borrowed PCM into a queue limited to 100 outstanding buffers before conversion or output. Overflow or a copy failure closes admission and enqueues one error; accepted buffers still drain. Tests cover overflow, interleaved/noninterleaved stereo, 44.1/48 kHz input, buffer reuse and silence. Both tracks use a shared host-time epoch established after both devices start. Samples arriving during preparation are discarded rather than counted as meeting time. Stopping waits for both sources before flushing the final chunks. Lifecycle diagnostics contain stage names and OS status codes, never audio.

Read the aggregate's settled format and nominal sample rate after IO starts, and observe rate changes on the device queue. The initial stream format can report 48 kHz before negotiating a 44.1 kHz hardware clock; retaining that initial rate compresses the system track's timeline. A short lock publishes the current format to the IO callback. Each copied buffer keeps that format through conversion, even if the device rate changes while conversion is queued. Synthetic tests verify initial negotiation and a rate change with pending buffers, preserving five seconds of audio.

Realtime voice and plugin capture share the Desktop microphone permission service. Permission requests run only during user-initiated startup, before recording callbacks or voice-session admission. A denied/restricted OS permission, a missing packaged `audio-input` entitlement, and an unverified permission check have separate error codes. System-audio consent remains a separate Core Audio tap check: `kAudioDevicePermissionsError` maps to `system_audio_permission_denied`, while unavailable devices remain `audio_source_missing`. Quiet system audio is normal and does not trigger a no-signal failure.

The macOS build applies `resources/entitlements.mac.plist` to the main app and Electron helpers and explicitly signs the unpacked native recorder. The `afterSign` hook checks the actual signed artifacts and fails if an audio executable or its audio-input entitlement is missing. Unsigned development builds do not establish release readiness. Validate OS prompts, nonzero microphone input, mute/unmute, and system-audio capture again on a signed installation before release.

Launch a packaged app through Finder or Launch Services (`open -a /absolute/path/Bosi.app`). For an isolated local profile, use `open --env XPERT_DESKTOP_USER_DATA=/absolute/path/profile -a /absolute/path/Bosi.app` after quitting the previous instance. Executing `Contents/MacOS/Bosi` directly from a terminal or automation host can attribute microphone permission to that host instead of Bosi. Check the TCC log's responsible application when diagnosing permission or startup problems; this attribution alone does not prove the cause of an audio-device timeout.

Realtime voice warns after ten seconds of consecutive all-zero PCM and closes after thirty seconds. Any nonzero input resets this check, and intentional in-app mute suspends it. Missing worklet audio frames fail after ten seconds. These are input-signal diagnostics, not proof of an OS permission denial; audio samples are never included in diagnostic logs.

- `corepack pnpm --filter @xpert-ai/desktop test` exercises the JS controller, renderer bridge and existing Desktop behavior without recording real audio.
- `corepack pnpm --filter @xpert-ai/desktop test:audio-native` builds the universal macOS helper and a separate temporary test executable from the shared capture sources. The test entry is excluded from the shipped helper. Tests use synthetic buffers and simulated device startup; they do not request audio permission or acquire devices.
- `corepack pnpm --filter @xpert-ai/desktop build` builds the helper, checks renderer types and bundles the app.

This is a new capability contract. Consumers of earlier application-specific prototype commands must migrate their View manifest, callbacks and capture-id mapping; there is no application-specific compatibility branch in Desktop. Actual microphone/system capture and OS permission prompts still require live acceptance after the consumer plugin is integrated.
