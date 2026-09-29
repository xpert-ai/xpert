# Presentations runtime

Install from the platform checkout with Node.js >=22 and Python >=3.9:

```sh
node tools/presentations-runtime/install.mjs
```

The installer uses `~/.local/share/xpert/presentations`: one isolated Python
venv and `npm ci --ignore-scripts` with a checked-in lockfile. It does not alter
system Python, Codex, Documents or PDF. It must run as the desktop sandbox user.
Install LibreOffice including Impress and the Noto Sans CJK SC font separately.
On macOS the Skill finds LibreOffice in `/Applications` or `~/Applications`;
on Linux install `libreoffice-impress fonts-noto-cjk`.

Optional environment variables:

| Variable                    | Meaning                                            |
| --------------------------- | -------------------------------------------------- |
| XPERT_PRESENTATIONS_RUNTIME | Directory containing package.json and node_modules |
| XPERT_PRESENTATIONS_PYTHON  | Presentation venv Python executable                |
| XPERT_PRESENTATIONS_NODE    | Node.js >=22 executable                            |
| XPERT_PRESENTATIONS_SOFFICE | LibreOffice executable                             |

The portable `agent-plugins/presentations` package supplies the CLI and Skill.
Run its `scripts/presentations.py doctor` through the actual sandbox after
installation. Rendering to fresh PNGs and checking Chinese glyphs are required;
a successful import/doctor does not establish LibreOffice/font fidelity.
The runtime is open source: PptxGenJS (MIT), python-pptx (MIT), lxml (BSD),
Pillow (HPND), pypdfium2 (Apache/BSD with PDFium third-party notices), and
LibreOffice (MPL/LGPL). No Codex-private library is included.

In PRO, both Dockerfiles copy an isolated Node.js 22 binary from the same pinned
official multi-platform image, its locked npm dependencies, and the presentation
venv. The existing sandbox Node installation is unchanged. Final images install
LibreOffice Impress and inherit Documents' CJK fonts. Build/test the final
sandbox service, not just a dependency stage. AMD64 and ARM64 share runtime pins.
