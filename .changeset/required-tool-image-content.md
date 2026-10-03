---
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-ai': patch
---

Add typed ModelRequest.requirements and mergeModelRequirements for per-call capability requirements, initially supporting ModelFeature.VISION. The host validates and snapshots middleware contributions, unions requirements across the call chain, and checks each invoked model including fallbacks. Required capabilities cannot silently degrade or substitute a static response. Calls without requirements retain existing behavior. Generic multimodal ToolNode support remains deferred.
