#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_PATH="$APP_ROOT/XpertAI.xcodeproj"
SCHEME="${IOS_SCHEME:-XpertAI}"

resolve_xcode_developer_dir() {
  if [[ -n "${DEVELOPER_DIR:-}" && -x "$DEVELOPER_DIR/usr/bin/xcodebuild" && -x "$DEVELOPER_DIR/usr/bin/simctl" ]]; then
    printf '%s\n' "$DEVELOPER_DIR"
    return 0
  fi

  local selected_dir
  selected_dir="$(xcode-select -p 2>/dev/null || true)"
  if [[ -n "$selected_dir" && -x "$selected_dir/usr/bin/xcodebuild" && -x "$selected_dir/usr/bin/simctl" ]]; then
    printf '%s\n' "$selected_dir"
    return 0
  fi

  for candidate in /Applications/Xcode.app /Applications/Xcode-beta.app; do
    if [[ -x "$candidate/Contents/Developer/usr/bin/xcodebuild" && -x "$candidate/Contents/Developer/usr/bin/simctl" ]]; then
      printf '%s\n' "$candidate/Contents/Developer"
      return 0
    fi
  done

  return 1
}

find_first_available_iphone_destination() {
  xcrun simctl list devices available 2>/dev/null \
    | sed -nE '/iPhone.*\((Booted|Shutdown)\)/s/.*\(([0-9A-Fa-f-]{36})\).*/id=\1/p' \
    | head -n 1
}

if ! XCODE_DEVELOPER_DIR="$(resolve_xcode_developer_dir)"; then
  cat >&2 <<'EOF'
Full Xcode is required for iOS simulator build/test.

Current state looks like Command Line Tools only. Install Xcode, then either:
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

or run this script without changing global state:
  DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer apps/ios/scripts/verify-ios.sh

If Xcode was just installed, open it once or run:
  sudo xcodebuild -license accept
  sudo xcodebuild -runFirstLaunch
EOF
  exit 2
fi

export DEVELOPER_DIR="$XCODE_DEVELOPER_DIR"
printf 'Using DEVELOPER_DIR=%s\n' "$DEVELOPER_DIR"
xcodebuild -version

printf '\n== Swift package build ==\n'
xcrun swift build --package-path "$APP_ROOT"

if [[ "${RUN_SWIFT_TESTS:-1}" == "1" ]]; then
  printf '\n== Swift package tests ==\n'
  xcrun swift test --package-path "$APP_ROOT"
fi

printf '\n== Xcode project build ==\n'
xcodebuild \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -destination "${IOS_BUILD_DESTINATION:-generic/platform=iOS Simulator}" \
  build

if [[ "${RUN_IOS_TESTS:-1}" == "1" ]]; then
  IOS_TEST_DESTINATION="${IOS_TEST_DESTINATION:-$(find_first_available_iphone_destination)}"
  if [[ -z "$IOS_TEST_DESTINATION" ]]; then
    cat >&2 <<'EOF'
No available iPhone simulator destination was found for xcodebuild test.
Boot or install an iOS simulator, or pass one explicitly, for example:
  IOS_TEST_DESTINATION='platform=iOS Simulator,name=iPhone 16' apps/ios/scripts/verify-ios.sh
EOF
    exit 3
  fi

  printf '\n== Xcode project tests (%s) ==\n' "$IOS_TEST_DESTINATION"
  xcodebuild \
    -project "$PROJECT_PATH" \
    -scheme "$SCHEME" \
    -destination "$IOS_TEST_DESTINATION" \
    test
fi
