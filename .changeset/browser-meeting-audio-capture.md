---
'@xpert-ai/xpert-ui': patch
'@xpert-ai/desktop-protocol': patch
---

Support browser microphone recording with optional shared tab audio through declared View client commands and a host permission dialog. Produce independent 24 kHz PCM WAV chunks, preserve ordered retryable delivery in page memory, and carry the initiating View runtime scope to event and file actions. Add translated source selection and upload-lifetime guidance.

Keep capture state and controls scoped to the initiating identity, View and Project, respect capture ID selection, and stop on device loss, scope changes or recording limits. Confirm meeting creation before starting capture, release devices on failed or cancelled startup, and preserve the final audio block before the stopped event. Add regression coverage for permission cleanup, delivery retries, scope changes, PCM processing and browser/native command separation.
