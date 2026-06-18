# XpertAI iOS

Native SwiftUI shell for the XpertAI mobile experience.

- iOS 17+ with Swift Observation, `TabView`, and per-tab `NavigationStack`.
- Account auth uses `/api/auth/login`, `/api/auth/refresh`, `/api/user/me`, and Keychain-backed token persistence.
- Runtime config and assistant discovery use `/api/mobile/bootstrap` and `/api/mobile/xperts`.
- ChatKit and `remote_component` views run inside `WKWebView` islands. Remote components talk to native through the `xpertai.remote_component` protocol v1 and never receive API tokens.
- Common tools cover scheduled tasks, assistant memory files, and `sandbox-terminal` via `socket.io-client-swift` pinned to `16.1.1`.

The checked-in Xcode project is self-contained. The Swift package exists so core models, networking, and protocol validation can be tested independently.

## Local Xcode Verification

Run:

```bash
apps/ios/scripts/verify-ios.sh
```

If the machine only has Command Line Tools selected, install full Xcode and either select it globally:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

or keep global state untouched for this run:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer apps/ios/scripts/verify-ios.sh
```

The script runs SwiftPM build/tests, Xcode Simulator build, and Xcode tests. Override the test destination when needed:

```bash
IOS_TEST_DESTINATION='platform=iOS Simulator,name=iPhone 16' apps/ios/scripts/verify-ios.sh
```
