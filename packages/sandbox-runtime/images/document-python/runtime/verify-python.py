import hashlib
import importlib.metadata
import io
import json
import platform
import sys
from pathlib import Path

from packaging.requirements import Requirement
from markitdown import MarkItDown, StreamInfo

manifest = json.loads(Path(sys.argv[1]).read_text())
requirements = Path(sys.argv[2]).read_bytes()
assert platform.python_version() == manifest["pythonVersion"], "Python version mismatch"
assert hashlib.sha256(requirements).hexdigest() == manifest["requirementsSha256"], "Dependency lock mismatch"
for line in requirements.decode().splitlines():
    line = line.split("\\")[0].strip()
    if not line or line.startswith(("#", "--")):
        continue
    requirement = Requirement(line)
    if requirement.marker is None or requirement.marker.evaluate():
        assert importlib.metadata.version(requirement.name) in requirement.specifier, requirement.name
assert importlib.metadata.version("markitdown") == manifest["markitdownVersion"]
for module in ("pdfminer", "pdfplumber", "mammoth", "pptx", "lxml"):
    __import__(module)
result = MarkItDown(enable_plugins=False).convert_stream(
    io.BytesIO(b"<h1>Runtime smoke</h1>"), stream_info=StreamInfo(extension=".html")
)
assert "# Runtime smoke" in result.markdown
print(json.dumps({"pythonVersion": platform.python_version(), "markitdownVersion": manifest["markitdownVersion"]}))
