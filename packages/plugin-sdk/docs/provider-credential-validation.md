# Provider credential validation

The credential dialog can test unsaved credentials without creating a provider record. The host selects a verification method from the provider strategy's explicit capabilities:

1. If `discoverModels(credentials)` exists, use it to fetch the account-visible model list. An empty successful list is valid. Discovery failures never trigger an automatic inference fallback.
2. Otherwise, if `credentialValidation.mode` is `model`, require a user-selected model type and Model ID or Endpoint ID. Run the provider's local credential checks, then that model manager's `validateCredentials(model, credentials)`.
3. Otherwise, retain the provider's existing `validateProviderCredentials(credentials)` behavior.

## Discovery

Implement the existing optional `IAIModelProviderStrategy.discoverModels` method. Use `discoverOpenAIModels` only when the upstream documents an authenticated OpenAI-compatible model-list endpoint. Public catalog metadata is not credential verification. Do not invoke inference, persist models or return credentials from discovery.

## Model-based verification

Providers without an API-key model-list endpoint can declare:

```ts
readonly credentialValidation = {
  mode: 'model' as const,
  modelTypes: [AiModelTypeEnum.LLM]
}
```

Declare only types whose model manager can perform a real, bounded validation request. The provider-level validator should check local fields, without choosing a fixed model. The host obtains suggestions from the provider catalog, but permits user-entered IDs that are absent from it. Catalog membership is not evidence of access.

## HTTP and persistence

- `GET /api/ai-model/provider/:provider/credential-validation` returns the supported verification method and, for model tests, model types and reference suggestions.
- `POST` to the same path accepts `{ credentials, validationTarget? }`, where the target is `{ modelType, model }`. It requires `COPILOT_EDIT`, does not save credentials or models, and returns only a verification result.
- Provider create/update requests can include the same `validationTarget`. The controller validates and strips it from the persisted entity, then passes it through the upsert and credential-validation commands.
- The save path repeats verification with the submitted credentials. Client-side success is never used as authorization or a reason to skip verification. Editing credentials or the test target invalidates the dialog's current result.
- Discovery proves access to the model-list API; successful inference validates only the selected target. Neither guarantees access to every listed model.

Deploy this host update before a plugin that relies on `credentialValidation`: older hosts do not enforce selected-model verification. Existing saved credentials and configured models are not migrated by this change.
