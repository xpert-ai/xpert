# Xpert Desktop

Electron + React 19 + the repository's shadcn/ui primitives. The client owns a
Sidebar and a Right Content Panel. The right panel embeds the official
`@xpert-ai/chatkit-web-component`; it does not implement a second chat UI.

The desktop uses an amber primary color (`#f59e0b`) with a 12px radius token
(10px inputs, 16px cards/dialogs). ChatKit receives the same primary token and
its native `soft` radius preset; coverage inside the hosted frame depends on ChatKit.
Both light and dark appearance modes use this theme.

Use **用户菜单 → 连接与外观 → 外观** to customize the theme. Desktop options include
27 semantic color tokens (independent light/dark palettes), base font size, local
font families, 0–24px radius and assistant-list density. Appearance mode,
density and palette selection use accessible icon toggle groups; remaining
dropdowns use shadcn Select. The settings dialog scrolls along its outer right
edge, with a sticky header and footer. ChatKit options include its
native radius/density presets, 14–18px base font size, text/code font families,
accent color/level, grayscale hue/tint/shade and light/dark surface colors.
Blank ChatKit accent/font fields inherit the desktop values; other blank colors
use their defaults. Fonts must already be installed; this UI does not load font URLs.

Changes preview immediately. Cancel, Escape or closing the dialog restores the
saved theme; **保存设置** persists appearance with the local connection config without
logging out or remounting the conversation. **恢复默认外观** resets custom variables
in the draft while retaining the selected light/dark/system mode and service URLs.
The host validates values and upgrades older configs with defaults. ChatKit only
applies variables consumed by its hosted version; fixed component styles are not
overridden by the desktop client.

## Run

Use Node 22.12+ (Node 24 LTS recommended) and the repository's Corepack-managed
pnpm 10.24.0. Run these commands from the Xpert repository root:

```sh
corepack pnpm install
corepack pnpm --filter @xpert-ai/desktop dev
```

The app opens an Electron window. Development uses port **4390** and fails if
that port is already occupied. For a browser-only preview:

```sh
corepack pnpm --filter @xpert-ai/desktop dev:web
```

Open <http://127.0.0.1:4390/>. This preview uses an HttpOnly, SameSite cookie and an
in-memory host session. Browser refresh preserves the session; restarting the
preview server clears it. The development bridge is not part of the packaged app.

## Connect to Xpert

Open **连接设置** on the login screen, or **用户菜单 → 连接与外观 → 连接**:

| Setting                           | Local default                              |
| --------------------------------- | ------------------------------------------ |
| API service root (without `/api`) | `http://localhost:3000`                    |
| Xpert Web                         | `http://localhost:4200`                    |
| ChatKit frame                     | `http://localhost:4200/chatkit/index.html` |

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

The frame URL must point at a trusted deployment of Xpert ChatKit. Check both its
HTML and referenced JS/CSS assets if the panel is blank. After updating ChatKit
packages in a running Angular development server, restart that server so its
asset manifest matches the installed package. Remote services require HTTPS;
HTTP is accepted only for loopback development addresses.

## Desktop Shell

The native macOS app can execute commands for an authorized server Assistant.
Enable **Desktop Shell** middleware in the Assistant, then use **Connection &
appearance → Desktop Shell → Enable Shell** and **Use this computer** in the
conversation. See [setup, protocol and limits](docs/desktop-shell.md).

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
macOS, Windows and Linux; signing/notarization and updates are release work, not
configured by this first client.

For live integration testing, use the existing Xpert development credential
convention: `XPERT_USERNAME` + `XPERT_PASSWORD` in the process environment, or the
macOS Keychain services `xpert-local-plugin-username` (OS user account) and
`xpert-local-plugin-password` (Xpert username account). Never put credentials in
source files or command arguments.

```sh
corepack pnpm --filter @xpert-ai/desktop test:local
XPERT_DESKTOP_LOCAL_LOGIN=1 corepack pnpm --filter @xpert-ai/desktop dev
```

The opt-in development button reads that credential mechanism inside the host.
It only works with a loopback API address and is absent from packaged apps.
`test:local` validates login, organization scope, Bot discovery, two scoped
ChatKit sessions, JWT refresh, frame assets and logout, without printing secrets.

See [verification.md](docs/verification.md) for the tested local environment and
remaining integration limits, and [design-qa.md](design-qa.md) for visual QA.

### Internationalization

English (`en`) is the source language and the default for new and legacy configurations. The desktop includes Simplified Chinese (`zh-Hans`), Traditional Chinese (`zh-Hant`) and Japanese (`ja`); `jp`, `ja-JP`, `zh-CN` and `zh-TW` inputs normalize to the corresponding supported locale.

Choose **User menu → Connection & appearance → Appearance → Language**. Changes preview immediately; Cancel restores the saved language and Save persists it locally. Changing only the language retains authentication, organization, selected assistant and the existing ChatKit element. Login, discovery, installation, tooltips, accessibility labels, form validation, host errors and native application menus use the shared resources in `electron/i18n/`. Native menu updates take effect on Save.

The renderer passes the selected locale to ChatKit and the host sends it in `Accept-Language`. Hosted ChatKit owns its translations: the currently tested local ChatKit UI bundle contains only `en-US` and `zh-CN`; Japanese falls back to English and Traditional Chinese resolves to Simplified Chinese in that version. Full ChatKit translations require a hosted ChatKit version with those resources. User-authored organization names, assistant names and plain descriptions are preserved. Structured marketplace translations select the requested language with English fallback.

To add a language, add a JSON resource matching every English key and interpolation placeholder, register it in `electron/i18n/index.mjs` and its declaration, and update locale normalization. Use English source messages in `t(...)`; do not translate module-level constants at import time. Host errors carry message keys and parameters so even an unsaved language preview can display errors in the chosen language. `tests/i18n.test.cjs` checks resource coverage, placeholders, untranslated JSX, aliases, persistence, host error handling and localized marketplace metadata.
