# Xpert Bosi

**Bosi** is your AI team leader. **You set the goal. Bosi leads the team.**

**日常称呼：Bosi · 完整名称：Xpert Bosi · 定位：你的 AI 小队长 · 宣传语：你定目标，Bosi 带队。**

See [brand naming and compatibility](docs/branding.md).

Stable installed builds support in-app updates. When an update is available, the
account footer shows a download icon that expands to **更新 / Update** on hover or
keyboard focus. Click to download and view progress; when ready, choose **安装并重启 /
Install and restart** or **稍后 / Later**. The restart action exits Bosi, installs the
update and reopens it. Updates use the running OS/architecture and verify the download.
See [update feeds, signing requirements and acceptance](../../.deploy/desktop/README.md#in-app-updates).

Electron + React 19 + the repository's shadcn/ui primitives. The client owns a
Sidebar and a Right Content Panel. The right panel embeds the official
`@xpert-ai/chatkit-web-component`; it does not implement a second chat UI.

The desktop uses an amber primary color (`#f59e0b`) with a 12px radius token
(10px inputs, 16px cards/dialogs). ChatKit receives the same primary token and
its native `round` radius preset; coverage inside the hosted frame depends on ChatKit.
Both light and dark appearance modes use this theme.

Use **用户菜单 → 设置 → 桌面外观** to customize the theme. Desktop options include
27 semantic color tokens (independent light/dark palettes), base font size, local
font families, 0–24px radius and assistant-list density. Appearance mode,
density and palette selection use accessible icon toggle groups; remaining
dropdowns use shadcn Select. Settings occupies the full window. The sidebar groups **General**, **Desktop appearance** and
**Chat appearance** under **Basic settings**, and **Service connection** and **Local terminal**
under **Connections & capabilities**. Search filters these destinations by their labels and settings.
The main content scrolls independently while the back button and save bar stay visible. ChatKit options include its
native radius/density presets, 14–18px base font size, text/code font families,
accent color/level, grayscale hue/tint/shade and light/dark surface colors.
Blank ChatKit accent/font fields inherit the desktop values; other blank colors
use their defaults. Fonts must already be installed; this UI does not load font URLs.

Changes preview immediately. **取消更改** restores the saved values; **保存设置**
persists them and keeps Settings open. **返回工作区** returns to the same assistant
and conversation, with a discard prompt if edits are unsaved. The workspace remains
mounted while Settings is visible. The login screen opens **Service connection**
and uses **返回登录**. Terminal settings retain their separate **Apply Shell settings**
action; navigation preserves terminal drafts, and Cancel also resets those drafts. **恢复默认外观** resets custom variables
for the current desktop/chat section in the draft, retaining the selected light/dark/system mode and service URLs.
The host validates values and upgrades older configs with defaults. ChatKit only
applies variables consumed by its hosted version; fixed component styles are not
overridden by the desktop client.

For a trusted self-signed/private deployment, open **设置 → 服务连接** and enable
**允许不受信任的服务证书**. This is off by default, saved locally, and applies only
to the configured API, web and ChatKit HTTPS hostnames, across their paths and ports.
Other hosts still use normal certificate verification. The API and embedded
ChatKit share an isolated Chromium connection session; Desktop Shell applies the
same setting to its configured API WebSocket connection. Saving a changed service
or certificate policy recreates the connection and window, and requires signing
in again, so cached certificate exceptions cannot survive turning this off.
The browser-only development preview cannot override browser TLS trust and keeps
this switch disabled. Certificate trust, validity and hostname errors are shown
separately from DNS, timeout and connection-refused errors.

The Connection tab checks draft service URLs after typing stops, using a separate
strict Chromium session. HTTPS addresses sharing an origin are checked once, with
no credentials and no redirects. Untrusted certificates show a warning even when
the exception is enabled; network failures report unknown trust rather than an
untrusted certificate. These diagnostics never block saving settings or sign-in.

After building the renderer, run `node scripts/test-certificates.mjs` from
`apps/desktop` to verify strict/allowed TLS, embedded ChatKit, Desktop Shell and
native settings reload against a temporary local self-signed HTTPS server.
This requires OpenSSL and Electron; it uses isolated profiles and fixture
credentials, without changing system certificate trust or the daily app account.

## Run

Bosi branding lives in `resources/`: `icon-macos.png` supplies the login mark;
`logo.png` supplies the favicon and Windows/Linux application icons. On macOS,
`icon-macos.svg` frames the supplied PNG tile with transparent margins;
its 1024px RGBA export, `icon-macos.png`, supplies the development Dock icon.
Run `corepack pnpm --filter @xpert-ai/desktop icons:macos` on macOS to regenerate
`Xpert.iconset` and the packaged `Xpert.icns`. See [icon resources](resources/README.md).
Packaged macOS apps use their bundle icon.
Avatar components and their emoji, color and motion helpers live together in
`src/avatar/`. Consumers import `BotAvatar` and `PluginAvatar` from this directory;
its animation helpers remain internal.
Assistant avatars keep their custom images and emoji. Missing avatars use a vector
version of the smile tile: eyes and mouth follow the pointer with bounded parallax,
and the eye on the gaze side shrinks while the opposite eye grows. Pointer proximity
also changes eye scale. The background uses a stable pseudorandom color from the ten
`avatarPalette` entries in `electron/theme-defaults.json`, keyed by Assistant ID (not
name or row position). Palette order and the hash are stable across releases, so
refresh, restart, renamed Assistants and sidebar copies retain the same color.
The tile uses the Desktop theme radius directly, including square and circular limits.
Visible avatars share one animation driver; offscreen avatars and reduced-motion/coarse-pointer environments remain still.
The native host supplies window-local cursor positions while Desktop is focused,
including over ChatKit frames. It stops sampling when no visible avatar requests it
or the window loses focus. Browser previews follow the host document's pointer only.

Use Node 22.12+ (Node 24 LTS recommended) and the repository's Corepack-managed
pnpm 10.24.0. Run these commands from the Xpert repository root:

```sh
corepack pnpm install
corepack pnpm --filter @xpert-ai/desktop dev
```

The app opens an Electron window. Both `dev` and `dev:web` read
`XPERT_DESKTOP_DEV_URL` from the repository root `.env`; a shell environment override
takes precedence. The default is `http://127.0.0.1:4390/`. The development server
uses the configured loopback host and port and fails if that port is already occupied.
Electron receives the actual Vite URL, so the window and server cannot silently use different ports.
For a browser-only preview:

```sh
corepack pnpm --filter @xpert-ai/desktop dev:web
```

Open the local URL printed by Vite (by default <http://127.0.0.1:4390/>).
This preview uses an HttpOnly, SameSite cookie and an
in-memory host session. Browser refresh preserves the session; restarting the
preview server clears it. The development bridge is not part of the packaged app.

### Configure the development address and voice origins together

Keep these related settings next to each other in the repository root `.env`:

```dotenv
CLIENT_BASE_URL=http://localhost:4200
# Desktop development renderer; changing this requires restarting dev / dev:web.
XPERT_DESKTOP_DEV_URL=http://127.0.0.1:4390/
# API voice WebSocket allowlist; changing this requires restarting the API.
REALTIME_VOICE_ALLOWED_ORIGINS=http://localhost:4200,http://127.0.0.1:4390
```

Use your actual Cloud and Desktop addresses. The allowlist contains exact origins
(scheme, host and port), without paths or trailing slashes; `localhost` and
`127.0.0.1` are different origins. When changing the Desktop port, update its
allowlist entry too. The Desktop launcher cannot reconfigure an already running API.
Only the Desktop development address is read into Vite; other root `.env` values
are not copied into the renderer.

If the allowlist is omitted, the API allows `CLIENT_BASE_URL` only for HTTP(S)
renderers. Packaged Desktop uses `file://` and the existing desktop-ticket handling
for `Origin: null`, so production does not need a local development origin.
To test the built renderer without packaging an installer, build Desktop, then run
`corepack pnpm --filter @xpert-ai/desktop start` without a shell-level
`XPERT_DESKTOP_DEV_URL`. This start command does not load the root `.env`.

## Connect to Xpert

Open **连接设置** on the login screen, or **用户菜单 → 设置 → 服务连接**:

| Setting       | Default                          |
| ------------- | -------------------------------- |
| API service   | `https://api.xpertai.cn/api/`    |
| Xpert Web     | `https://app.xpertai.cn/`        |
| ChatKit frame | `https://app.xpertai.cn/chatkit` |

API URLs can include `/api/`; older service-root URLs such as
`http://localhost:3000` remain supported. The client normalizes trailing slashes
and avoids duplicating `/api` for REST and ChatKit requests. Shell connections
use the server root. Already saved connection settings take precedence over new
build defaults, so upgrading does not change an existing account's server.

### Customer builds

Set the three URLs when building installers (macOS/Linux shell, from the repo root):

```sh
XPERT_DESKTOP_API_URL=https://api.customer.example/api/ \
XPERT_DESKTOP_WEB_URL=https://app.customer.example/ \
XPERT_DESKTOP_CHATKIT_URL=https://app.customer.example/chatkit \
corepack pnpm --filter @xpert-ai/desktop package:installers
```

The native installer is written to `apps/desktop/release/`. This uses the same
build-time defaults as the CI builds. Signing follows your local electron-builder
configuration. `package` builds an unpacked app; `package:installers` builds the
current platform's configured installer and never publishes it.

For repeatable customer builds, copy `docs/connection.customer.example.json` to an
untracked file, edit its three URLs, and pass its **absolute** path:

```sh
mkdir -p .local
cp apps/desktop/docs/connection.customer.example.json .local/customer-connection.json
# Edit .local/customer-connection.json, then:
XPERT_DESKTOP_CONNECTION_FILE="$PWD/.local/customer-connection.json" \
corepack pnpm --filter @xpert-ai/desktop package:installers
```

PowerShell supports the same configuration file:

```powershell
$env:XPERT_DESKTOP_CONNECTION_FILE = (Resolve-Path .local/customer-connection.json).Path
corepack pnpm --filter @xpert-ai/desktop package:installers
Remove-Item Env:XPERT_DESKTOP_CONNECTION_FILE
```

Environment URL overrides take precedence over the JSON file, which takes
precedence over the official defaults. If only the Web URL is customized, ChatKit
defaults to `<webUrl>/chatkit`; an explicit ChatKit URL takes precedence. Invalid
URLs fail the build. Only `apiUrl`, `webUrl`, and `frameUrl` are accepted in the JSON
file. Do not put credentials there.

Vite writes the resolved URLs to `dist/connection-defaults.json`, which is included
in the app. Installed apps read that snapshot without requiring environment
variables on the customer's computer. A build with no overrides resets the snapshot
to the official URLs. To verify defaults on a machine that already has Bosi,
use a separate test profile or change **连接设置**; existing saved settings are retained.

The same variables apply to `dev` and `dev:web`. For local platform development:

```sh
XPERT_DESKTOP_API_URL=http://localhost:3000/api/ \
XPERT_DESKTOP_WEB_URL=http://localhost:4200/ \
XPERT_DESKTOP_CHATKIT_URL=http://localhost:4200/chatkit/index.html \
corepack pnpm --filter @xpert-ai/desktop dev
```

### Sign in and discover assistants

New users can choose **Create account** on the sign-in screen. Registration opens
`auth/register` under the configured Web URL in the system browser; after completing
the platform's registration and verification flow, return to Desktop to sign in.

Use the existing Xpert email and password to sign in. The application then loads
the user's organizations and accessible published Agents from the existing
`/api/mobile/bootstrap` and `/api/mobile/xperts` APIs. Select a workspace and Bot.
The `+` button opens **发现与添加**, a searchable catalog with three tabs:

- **专家:** use accessible experts immediately, or submit an access request and reason.
- **应用:** use installed applications, or review installation requirements and select
  the available embedding/vision models before host-managed initialization.
- **智能体模板:** choose a writable workspace and assistant name, then initialize and
  publish the template. Platform default models and template dependencies still apply.

Successful installation refreshes the Sidebar and opens the assistant in ChatKit.

Application cards use `config.presentation.screenshots` as a lightly blurred background with a theme-aware text scrim. Select the application name or **View details** to browse full screenshots, including for installed applications. The detail carousel supports previous/next buttons, numbered indicators and arrow keys, without autoplay. Missing screenshots keep the plain card; failed images can be retried in the detail view. Screenshot URLs are normalized at the host boundary, accepting inline images, HTTPS and loopback development URLs; root-relative assets resolve against the configured Web URL.

The frame URL must point at a trusted deployment of Xpert ChatKit. Check both its
HTML and referenced JS/CSS assets if the panel is blank. After updating ChatKit
packages in a running Angular development server, restart that server so its
asset manifest matches the installed package. Remote services require HTTPS;
HTTP is accepted only for loopback development addresses.

## Assistant list and split panels

Right-click an assistant (including pinned cards and the collapsed avatar rail)
to pin/unpin, move to a personal section, mark read/unread, edit its local profile,
duplicate its local entry, or copy its current/latest conversation ID. Pinned
assistants appear as avatar cards above the list. Within each group, assistants
sort by creation time (newest first), using the same ordering helper as Cloud.
Unread indicators and conversation activity do not reorder assistants or groups.
Equal or missing creation dates keep their source order. Existing Cloud drag order
and Desktop pins/groups remain local preferences; they do not sync across clients.
Rows show the latest conversation title, falling back to the assistant description.
Activity refreshes every 15 seconds while visible and when the window regains focus.

Profile edits and duplicates affect **only this computer's list**. A duplicate
connects to the same platform Assistant and conversation history; it does not clone
or publish a server Assistant. Pins, sections, manual unread, profile overrides,
copies, and sidebar layout persist per service/account/organization. Reading a
conversation or selecting **Mark as read** updates the platform's existing read
state; **Mark as unread** is a local reminder.

Drag the sidebar divider to resize between 240 and 520 CSS pixels. Drag past the
minimum by more than 120 pixels to collapse into a 72-pixel avatar rail. The toggle
restores it; double-click the divider to reset to 320. Keyboard arrows resize,
Home/End select the limits, and Enter collapses. In local ChatKit, the chat / Workbench
divider similarly collapses the chat below half of its 384-pixel minimum; use
**Restore panel** to bring chat back without losing its draft.

For local ChatKit development, start the sibling repository with the API proxy
target set to your running Xpert service:

```sh
cd ../chatkit-js
XPERT_API_PROXY_TARGET=http://127.0.0.1:3190 corepack pnpm --filter @xpert-ai/chatkit-ui dev --host 127.0.0.1 --strictPort
```

In desktop connection settings set both **API URL** and **ChatKit URL** to
`http://127.0.0.1:5173`. Vite proxies `/api` and `/socket.io` to the target service,
so the embedded frame can authenticate without adding a development origin to
the API's CORS configuration. Keep the Web URL pointed at your local Xpert web app.

The desktop follows that runtime's Workbench implementation. Views must receive
the current conversation record ID through SDK `runtimeScope`; they must not use
the execution thread ID. Keep the remote iframe sandbox enabled. Switching a
conversation disposes its old remote view and connections. A production deployment
must ship the updated ChatKit frame assets, not just the desktop executable.

## Desktop Shell

The native macOS app can execute commands for an authorized server Assistant.
Enable **Desktop Shell** middleware in the Assistant. Bosi connects when the
Agent requests a local command and shows an approval card in the message. The
default is **Ask for every command**; manage the scoped policy in **Settings → Local terminal**. See [setup, protocol and limits](docs/desktop-shell.md).

## Client boundary

- **Sidebar:** organization switch, searchable published Bots, refresh, open
  workspace, connection/theme settings and logout.
- **ChatKit:** header, messages and streaming, composer, attachments, history,
  tools, skills, connectors and workbench. These continue to use ChatKit's own UI
  and the connected Xpert server's capabilities and permissions.
- **Host:** fixed IPC operations for login, session refresh, organization/Bot
  discovery, marketplace access/initialization and scoped ChatKit sessions.
  Account JWTs, template DSL and plugin configuration never enter renderer state.
  The server derives application scope; template installs recheck workspace write
  permission. Application retries retain their operation ID. Template writes are
  not automatically retried after an ambiguous network failure.
- **Storage:** Electron `safeStorage` encrypts account tokens with the OS secret
  store. If OS encryption is unavailable, credentials remain in memory only.
  Passwords are never persisted. Changing any connection address clears login.
  Startup decrypts saved tokens to restore the session, which can prompt for macOS
  Keychain access. Reinstalling the app can retain its user-data directory and
  therefore its session. Sign out to clear the saved tokens. Denying Keychain
  access requires signing in again while retaining connection and language settings.
- **Isolation:** sandboxed renderer, context isolation, Node integration off,
  sender-validated IPC, no generic filesystem/shell/request bridge. Web links open
  in the system browser. ChatKit receives short-lived session secrets via its SDK
  callback, never a secret in an iframe query parameter.

The desktop embeds the ChatKit frame hosted by the configured Xpert Web service;
it is not an offline bundle of the Xpert backend or ChatKit runtime.

## Build and test

```sh
corepack pnpm --filter @xpert-ai/desktop test
corepack pnpm --filter @xpert-ai/desktop build
corepack pnpm --filter @xpert-ai/desktop start
corepack pnpm --filter @xpert-ai/desktop package
```

`start` runs the compiled assets without Vite. `package` builds an unpacked native
application under `apps/desktop/release`. Platform release targets are defined for
macOS, Windows and Linux. [GitHub Actions releases](../../.deploy/desktop/README.md)
build x64 and arm64 installers for each platform using Changesets, with optional
signing/notarization and a reviewed GitHub Release draft. Automatic application
updates are not configured.

For live integration testing, use the existing Xpert development credential
convention: `XPERT_USERNAME` + `XPERT_PASSWORD` in the process environment, or the
macOS Keychain services `xpert-local-plugin-username` (OS user account) and
`xpert-local-plugin-password` (Xpert username account). Never put credentials in
source files or command arguments.

```sh
corepack pnpm --filter @xpert-ai/desktop test:local
XPERT_DESKTOP_LOCAL_LOGIN=1 \
XPERT_DESKTOP_API_URL=http://localhost:3000/api/ \
XPERT_DESKTOP_WEB_URL=http://localhost:4200/ \
XPERT_DESKTOP_CHATKIT_URL=http://localhost:4200/chatkit/index.html \
corepack pnpm --filter @xpert-ai/desktop dev
```

The opt-in development button reads that credential mechanism inside the host.
It only works with a loopback API address and is absent from packaged apps.
`test:local` validates login, organization scope, Bot discovery, two scoped
ChatKit sessions, JWT refresh, frame assets and logout, without printing secrets.

See [verification.md](docs/verification.md) for the tested local environment and
remaining integration limits, and [design-qa.md](design-qa.md) for visual QA.

### Internationalization

New installations initialize from the first supported language in the operating system's preferred language list (the browser's language list in the development preview). English (`en`) remains the fallback and source language. Saved desktop language choices are retained before sign-in; legacy configurations without a valid language use the environment default. After sign-in, session restoration or profile refresh, the account's supported `preferredLanguage` takes precedence. Accounts without a supported language keep the desktop setting. The desktop includes Simplified Chinese (`zh-Hans`), Traditional Chinese (`zh-Hant`) and Japanese (`ja`); `jp`, `ja-JP`, `zh-CN` and `zh-TW` inputs normalize to the corresponding supported locale.

Choose **User menu → Settings → General → Interface language**. Changes preview immediately; Cancel changes restores the saved language and Save persists it locally. This does not edit the platform account preference, which is reapplied on the next sign-in or profile refresh. Changing only the language retains authentication, organization, selected assistant and the existing ChatKit element. Login, discovery, installation, tooltips, accessibility labels, form validation, host errors and native application menus use the shared resources in `electron/i18n/`. Native menus update when the saved or account language changes.

The renderer passes the selected locale to ChatKit and the host sends it in `Accept-Language`. Hosted ChatKit owns its translations: the currently tested local ChatKit UI bundle contains only `en-US` and `zh-CN`; Japanese falls back to English and Traditional Chinese resolves to Simplified Chinese in that version. Full ChatKit translations require a hosted ChatKit version with those resources. User-authored organization names, assistant names and plain descriptions are preserved. Structured marketplace translations, including JSON-serialized I18nObject descriptions, select the requested language with English fallback. Malformed JSON and ordinary JSON prose remain literal text.

To add a language, add a JSON resource matching every English key and interpolation placeholder, register it in `electron/i18n/index.mjs` and its declaration, and update locale normalization. Use English source messages in `t(...)`; do not translate module-level constants at import time. Host errors carry message keys and parameters so even an unsaved language preview can display errors in the chosen language. `tests/i18n.test.cjs` checks resource coverage, placeholders, untranslated JSX, aliases, persistence, host error handling and localized marketplace metadata.

### Native headers and assistant rail

Desktop enables ChatKit's opt-in `header.windowDrag` integration. Blank chat and Workbench header space is projected into native Electron drag regions, excluding interactive controls. Double-click follows the operating system's title-bar preference (normally zoom/maximize on macOS); it does not enter fullscreen. Frame menus and dialogs suspend the projected regions. No new native IPC permission is exposed.

This requires the matching ChatKit UI **and** web-component build containing `header.windowDrag`. For local integration before publishing the ChatKit packages, build `@xpert-ai/chatkit-types`, `@xpert-ai/chatkit-web-shared`, and `@xpert-ai/chatkit-web-component` in order, run the matching ChatKit UI, and supply the local bundle to Desktop:

```sh
XPERT_DESKTOP_CHATKIT_BUNDLE=/absolute/path/to/chatkit-js/packages/web-component/dist/xpert-chatkit.js \
  corepack pnpm --filter @xpert-ai/desktop dev
```

The override also applies to `build`. Normal installs use the packaged web component; upgrade that dependency together with the hosted ChatKit UI when releasing this integration. Older hosts safely ignore the option.

The assistant list hides native scrollbars and provides press-and-hold arrows. Wheel/trackpad and keyboard navigation remain available. Release, pointer cancellation, blur and unmount stop continuous scrolling. Only the assistant avatar triggers the hover profile; titles and descriptions remain conversation buttons. Focus the avatar and press `Alt+Down` to open and pin the profile for keyboard navigation. The compact header retains the avatar, name and explicit conversation status. Recent conversation titles appear in Activity, while description/version and capability counts are inside About. Channels and Automations manage the current assistant’s Xpert Triggers; see [trigger configuration](docs/assistant-trigger-settings.md). Activity refresh uses the existing 15-second polling cycle. Older APIs that omit status show “Status unavailable”, not a guessed idle state.

Pinned assistants, user-created sections and published business domains use the same grouping in both layouts, with divider lines between nonempty groups. Pins and manual sections take precedence. Otherwise, an assistant appears under its published `businessArea` (the `businessAreaId` relation), using the business area name without translating it as a marketplace category. Domains are maintained in Settings / Business Areas and selected during publication. Marketplace categories such as Business & operations do not determine sidebar groups. Missing, deleted or unnamed business areas remain Unassigned. Domain groups use the business area ID as identity, sort by name with ID as a tie-breaker, and retain creation order within each group. `Move to` / `Group by business domain` removes a manual assignment without changing the published metadata. Create or change sections from the assistant context menu (`Move to` / `New section`). Section membership is stored locally per account, organization and API endpoint; it is not yet shared with Cloud or other devices.

The Digital experts catalog uses one horizontally scrollable filter rail: All, published business domains, then broader marketplace categories. Domain and category selections are combined with search. Clicking a selected filter clears only that filter; All clears both types. Tooltips distinguish equally named domains and categories. Domains use published business-area IDs, and the available domain choices are derived from discoverable experts across pages. Experts without a business area remain available under All.

### Assistant profile Views

Profiles include the server-enabled `agent.profile.tabs` extension Views. A custom View is loaded when selected and retains its UI state while switching tabs. More lists additional custom Views. Remote components receive scoped host data and declared actions through a sandboxed bridge; account tokens never enter the component. See [assistant-profile.md](docs/assistant-profile.md) for the supported protocol, lifecycle and current limits.
