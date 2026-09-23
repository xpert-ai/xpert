# Desktop Documents environment

Run `node tools/documents-runtime/install.mjs` in the desktop API checkout.
Use `--python /path/to/python3` to choose a Python 3.9+ interpreter. The script
creates a dedicated environment under `~/.local/share/xpert/documents/venv` and
does not alter the API process environment or system Python packages.

Install LibreOffice Writer from its official distribution. On macOS the Skill
discovers `/Applications/LibreOffice.app` and `~/Applications/LibreOffice.app`.
On Linux it resolves `soffice` or `libreoffice` from PATH. A deployment can set
`XPERT_DOCUMENTS_SOFFICE` explicitly. Install a CJK font for Chinese documents,
for example Noto Sans CJK SC in `~/Library/Fonts` on macOS. The PRO image installs
Noto CJK. The Skill's macOS renderer supplies system/user font directories to
headless Fontconfig to avoid blank Chinese glyphs.

The Documents Skill launcher selects the dedicated Python automatically;
`XPERT_DOCUMENTS_PYTHON` can override it. Use the launcher for builders too, not
an unrelated shell Python. No API restart is needed for newly installed local
files at these standard paths. If environment variables change, restart the API.

PDFium renders the generated PDF without requiring Poppler on desktop. These
dependencies belong to the interactive Agent Sandbox; the `sandbox-runtime`
Sandbox Jobs images serve a different execution contract.

Keep this requirements file identical to the PRO copy under
`packages/sandbox/documents/requirements.txt`. Validate through the portable
Documents plugin lifecycle and generation/render/review smoke tests.
