# OpenAI-compatible Embedding usage callbacks

Model plugins can use `OpenAICompatibleEmbeddings` from `@xpert-ai/plugin-sdk` instead of maintaining provider-specific metering subclasses.

```ts
import { OpenAICompatibleEmbeddings, type TChatModelOptions } from '@xpert-ai/plugin-sdk'

function createEmbeddings(apiKey: string, baseURL: string, model: string, runtime?: TChatModelOptions) {
  return new OpenAICompatibleEmbeddings({ apiKey, model, batchSize: 10, configuration: { baseURL } }, runtime)
}
```

The adapter preserves the underlying client's vector results, request options, batching and transport retries. After a successful request, it normalizes the response's `usage.prompt_tokens` and `usage.total_tokens`, then invokes the existing `handleModelUsage` callback once for that request. Document batches receive distinct request IDs. Query embeddings use the same path.

When accounting is installed, `resolveUsagePricingSnapshot` runs before each request. Its result is forwarded unchanged with the final usage event. Accounting runs outside the transport retry loop; a callback failure propagates without repeating the provider request. A caller must not blindly retry an embedding operation after an accounting failure.

Missing, all-zero or invalid usage does not become an estimate or a fabricated provider report. The adapter itself does not calculate prices, resolve account scope or write a ledger; these remain host responsibilities. It does not also invoke the LLM-specific `handleLLMTokens` callback.

Runtime callbacks are optional for standalone use and credential validation. Native endpoints with different response contracts still need protocol-specific parsing. This adapter does not meter Tongyi's native multimodal endpoint.

Plugins consuming this export must be built and deployed with an SDK release containing it. An older SDK installation cannot supply the new class; refresh the plugin's build dependency and the host runtime together before release.
