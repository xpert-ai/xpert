---
'@xpert-ai/contracts': minor
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/server-ai': patch
---

Define versioned Project Task execution specifications, implementation/review purposes, evidence references and distinct invocation receipts. Add host-validated Runtime message provenance, reply metadata, progress observations and shared event/consumption identities.

This is the contract stage only. Durable Project Task dispatch, outbox/inbox consumers and automatic result delivery are not enabled by these declarations. Deploy compatible contracts, SDK and host before producing the new Runtime envelopes.

Use the published `@xpert-ai/chatkit-types` 0.11.1 package and declare the contracts package's Zod peer dependency. Host UI package upgrades follow with the live conversation integration.
