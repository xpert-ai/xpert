# Xpert Bosi

| Usage                                                     | Name or copy                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| Everyday name, application bundle, window and native menu | Bosi                                                           |
| Full product name, login and About panel                  | Xpert Bosi                                                     |
| Positioning                                               | Your AI team leader. / 你的 AI 小队长                          |
| Tagline                                                   | You set the goal. Bosi leads the team. / 你定目标，Bosi 带队。 |

Bosi is the desktop client of the Xpert platform. Xpert account, workspace,
server and publisher references retain the Xpert name. UI copy is localized in
English, Simplified Chinese, Traditional Chinese and Japanese.

`electron/branding.json` defines display names and the stable storage identity.
`package.json` uses `Bosi` as the packaged product name; macOS output is `Bosi.app`.
The package ID `@xpert-ai/desktop`, bundle ID `ai.xpert.desktop`, internal Electron
name `Xpert`, profile directory, IPC names and `XPERT_DESKTOP_*` variables stay stable.
The internal name is also used by OS encryption: changing it may prevent existing
credentials from decrypting. Never rename it as part of a visual branding update.
`XPERT_DESKTOP_USER_DATA` still selects an isolated profile for local testing.

The supplied smile icon is reused on the login page. Existing `Xpert.icns` and
`Xpert.iconset` filenames remain build inputs; they do not determine the app name.
Historical acceptance reports retain their original artifact names. Packaged apps
show Bosi at the OS level; development still runs inside Electron's app bundle.
