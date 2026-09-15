---
'@xpert-ai/sandbox-runtime': patch
---

Publish the document-python Runtime image with an explicit Python version tag.
Preserve existing browser and LibreOffice tags, reject missing image versions,
and verify Python image metadata against the runtime manifest and definition.
Bump the Runtime Suite so the release workflow builds and publishes its source
images before platform-version aliases are created.
