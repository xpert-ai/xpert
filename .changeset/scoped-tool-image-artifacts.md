---
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-ai': patch
---

Add the scoped `ToolImagesRuntimeCapability` for immutable tool image references and temporary verified model input. Bind storage and Artifact access to the current host conversation, enforce complete tool rounds and checksum validation, and keep image bytes out of tool messages and checkpoints. Legacy image-tool history is sanitized only in outbound request copies.
