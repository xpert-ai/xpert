---
'@xpert-ai/server-ai': patch
---

Clean up audio files staged by the speech-to-text buffer API after transcription succeeds or fails, while leaving caller-owned uploads untouched. Log cleanup failures without discarding a transcript or masking the original transcription error.
