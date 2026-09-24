# Spreadsheets desktop runtime

Run `node tools/spreadsheets-runtime/install.mjs` with Node 22+. The installer
uses `npm ci` to install the released `@xpert-ai/artifact-tool@0.1.0` and its
locked dependencies, creates an isolated Python venv, then verifies real formula
calculation plus LibreOffice/PDFium. The npm lockfile records registry URLs and
package integrity hashes. Install LibreOffice Calc and Noto Sans CJK SC through
the local OS first.

The installer writes to `~/.local/share/xpert/spreadsheets/runtime`. Pass
`--python <executable>` to select the Python used to create the venv.
The plugin launcher accepts `XPERT_SPREADSHEETS_RUNTIME`,
`XPERT_SPREADSHEETS_NODE`, and `XPERT_SPREADSHEETS_PYTHON`; the renderer accepts
`XPERT_SPREADSHEETS_SOFFICE`. These launch-time settings do not redirect the
installer. A custom runtime location must already contain the installed packages
and venv.

The portable plugin contains only Skill/resources and a launcher. Dependencies
are installed during administrator setup or image building; Agent conversations
do not download packages or require npm credentials.

## Updating the SDK

The SDK source lives in `xpert-plugins/packages/artifact-tool` and releases through
that repository's Changesets workflow. After an npm release:

1. Pin the same exact released version in this directory's `package.json` and
   `apps/cloud/package.json` in both Xpert and PRO.
2. Regenerate this directory's `package-lock.json` with
   `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`.
   Run `corepack pnpm install --lockfile-only --ignore-scripts` from each platform
   root to update the browser dependency lock.
3. In PRO, synchronize `package.json`, `package-lock.json` and `requirements.txt`
   to `packages/sandbox/spreadsheets`. Both Dockerfiles install that same runtime
   with `npm ci`; no vendored tarball is required.
4. Run `node --test tools/spreadsheets-runtime/contract.test.mjs`, reinstall the
   desktop runtime, rebuild the target sandbox image and run the portable
   Spreadsheets smoke fixture through its launcher and the sandbox HTTP service.
   Select the rebuilt image and create new sandboxes for rollout.

The browser uses the SDK's `@xpert-ai/artifact-tool/xlsx` entry for XLSX
preservation. The root entry also loads the Node calculation/runtime machinery
and should not be used by browser consumers.

Old installations may leave an unused `vendor` directory in the runtime root.
The updated installer and lockfile no longer read or copy it; no local tarball
distribution script is needed.
