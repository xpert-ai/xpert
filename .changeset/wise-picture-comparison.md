---
'@xpert-ai/server-ai': patch
'@xpert-ai/plugin-sdk': patch
---

Keep up to three verified recent tool images in a current image-inspection request so sequential reads can be compared. Bound history to the same user turn and twelve messages, prioritize current images, revalidate access and hashes, and keep pixels out of persistent checkpoints.
