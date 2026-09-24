# PDF desktop runtime

Run `node tools/pdf-runtime/install.mjs` in the desktop API checkout. Use
`--python /path/to/python3` to choose Python 3.9+. Installation creates
`~/.local/share/xpert/pdf/venv`, separately from system Python and Documents.
The pinned pdfplumber/Pillow versions retain desktop Python 3.9 compatibility.

The installer downloads Noto Sans SC TrueType and its OFL license from a fixed
Google Fonts commit, verifies both SHA-256 digests and stores them in the runtime's
`fonts/` directory. ReportLab embeds subsets; a PDF reader needs no local CJK font.
It does not modify system font configuration. The first installation needs access
to PyPI and raw.githubusercontent.com; generation/rendering need no network.

The portable PDF Skill automatically finds this environment. Deployments may set
`XPERT_PDF_PYTHON` and `XPERT_PDF_FONT` explicitly. Builders must run through
`python3 <skill>/scripts/pdf.py run builder.py` so they use the same dependencies.
Run `pdf.py doctor` through the actual sandbox to verify the interpreter and font.
No API restart is required for installation at the standard locations.

PDFium handles page rendering without a desktop Poppler installation. This does
not replace LibreOffice for Documents. The PRO interactive sandbox copies a
separate `/opt/xpert/pdf` runtime built from `packages/sandbox/pdf/`. Keep its
requirements/font installer byte-identical to these files and the OSS/PRO tools.
