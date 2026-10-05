---
'@xpert-ai/contracts': minor
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/server-ai': minor
---

Add the realtime voice model capability, model protocol adapter contract, and Bosi voice sessions. Assistant creation and settings can select an independently authorized realtime model and voice. The host relays bounded PCM audio over an authenticated, single-use-ticket WebSocket and dispatches durable Assistant tasks independently of call lifetime. Deploy the additive realtime voice migration and configure allowed renderer origins before enabling calls.

Introduce host-owned message envelopes with explicit source, target, correlation, and presentation for voice and future Assistant/Agent messages. Persist them in a dedicated typed `ChatMessage.messageEnvelope` JSONB column. Retain runtime execution, retry and branch history while applying consistent public-history filtering and protecting provenance from client edits. Apply the message-envelope migration before deployment.
