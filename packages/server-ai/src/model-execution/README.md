# Delegated model parameters

Execution grants pin the selected model's identity and a `ModelExecutionParameters` snapshot. Interactive sessions use the selected published Assistant model (including an allowed alternative); binding-directed invocations use the bound Assistant's configured default. Automatic Shell launches use the matching active parent execution's `primaryModelSnapshot`, including its options. Revalidation checks current model/provider access without replacing an issued parameter snapshot.

Only the explicit tuning fields in `modelExecutionParametersSchema` may enter this snapshot. Credentials, headers, endpoints, arbitrary provider configuration, context-window overrides and retry controls are excluded. Invalid values fail with `ModelExecutionParametersUnsupported`; explicit `false` and numeric zero are retained where the provider rule allows them. Legacy grants without a snapshot retain provider-default behavior; start a new execution to inherit the Assistant settings.

For Chat Completions and Responses/Messages translated to Chat, precedence is:

1. Effective provider parameter rules supply defaults for missing settings.
2. The issued Assistant snapshot supplies configured values.
3. Supported explicit request values (`temperature`, `top_p`, output limit, frequency/presence penalties and `seed`) override the snapshot. Omitted fields do not erase saved values.
4. Provider validation/normalization and host-owned controls apply. Retries remain zero; grant authorization, lifetime and cumulative token budgets remain enforced.

Constructor parameters are merged before creating the provider client; `.bind()` carries only invocation-owned `stop` and `seed`. Output aliases are canonicalized to `max_tokens` in the snapshot and translated to the provider's declared output field(s) before default resolution. Thus a default `max_completion_tokens` cannot shadow an explicit output limit. The effective inherited/requested output value also feeds execution admission. Catalog output maxima remain informational hints, not new execution caps.

Native Responses maps the snapshot output to `max_output_tokens` and reasoning effort to `reasoning.effort`. Native Messages maps output to `max_tokens` and its explicit thinking mode/budget to `thinking`. Explicit native request settings take precedence. Parameters without a supported protocol mapping fail before provider dispatch; provider-specific `enable_thinking` is not treated as an OpenAI native reasoning setting. The Chat bridge still carries text and client tools only, even when the upstream provider uses thinking internally.

Regression coverage in `execution-parameters.integration.spec.ts` follows real selection, grant issuance/revalidation, persisted schema validation, the Responses-to-Chat controller, model runtime and OpenAI-compatible request serialization. Provider transport is intercepted locally; these tests neither call an external model nor establish that repetitive model behavior is resolved.
