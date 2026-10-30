# Request-controlled thinking

The OpenAI-compatible `POST /api/openai/v1/chat/completions` endpoint accepts an optional thinking control:

| Request                            | Behavior                                             |
| ---------------------------------- | ---------------------------------------------------- |
| `"thinking": {"type": "enabled"}`  | Enable thinking for this request.                    |
| `"thinking": {"type": "disabled"}` | Disable thinking for this request.                   |
| Omitted                            | Preserve the provider's configured/default behavior. |

Only `type` is accepted, with the exact values `enabled` or `disabled`. Invalid values, additional fields such as `budget_tokens`, and models without a declared boolean `enable_thinking` parameter return HTTP 400. Both streaming and non-streaming requests use the same control. The shared ModelExecution Chat Completions route also applies explicit thinking values over its captured parameter snapshot.

## Reasoning effort compatibility

The same endpoint accepts `reasoning_effort`: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`.

- Models declaring a native string `reasoning_effort` parameter receive the exact requested level. A level outside the model's declared choices returns HTTP 400; it never falls back silently to a default or boolean.
- Models declaring only boolean `enable_thinking`, including Xirang, map `none` to `false` and all other accepted levels to `true`. These are on/off aliases, not distinct reasoning strengths. The alias is removed before provider construction.
- Omission preserves saved/provider defaults. Overrides affect only the current call, including the shared ModelExecution Chat route.
- If both `thinking` and `reasoning_effort` are supplied, they must agree: `disabled` with `none`, or `enabled` with a non-`none` level. Conflicts, malformed values (including `null`), and unsupported model controls return HTTP 400.
- Rejections before model invocation record zero usage and do not enter billing. Failures after invocation retain the existing usage/settlement behavior.

## External API address

In tenant scope, an administrator with Model Gateway management permission can set **Model API Gateway → Settings → External API Base URL**. Enter the complete base URL, for example `http://gateway.internal:8088/api/openai/v1`, without `/chat/completions`.

Once saved, Account → External API → Guide displays and copies that address instead of the website's origin. Both curl and VS Code examples append `/chat/completions` to the configured base. Refresh the guide after changing the setting. HTTP and HTTPS are supported; credentials, query strings and fragments are rejected. Leading/trailing whitespace and trailing slashes are removed.

The value applies to the current tenant, including its organization members. An empty value restores the current website origin plus `/api/openai/v1`; older settings updates that omit the field preserve it. Authenticated users read only this client-facing value from `GET /api/model-gateway/client-config`; admin settings retain their existing permission and tenant-scope restrictions. A failed configuration load shows the guide's retry state instead of offering an unconfirmed URL.

This setting advertises an existing reachable endpoint. It does not create a proxy, change browser management API requests, or configure a server listener. The administrator must deploy the intended endpoint separately.

## VS Code native Custom Endpoint

Account → External API → Guide includes a complete, copyable `chatLanguageModels.json` document below curl. The provider group contains `name`, `vendor`, `apiKey`, `apiType`, and `models`. Replace `YOUR_API_KEY` with a gateway key. The complete template remains copyable when the catalog is empty; replace `MODEL_ID` with a publication you are authorized to call. If the file already contains other providers, append this provider object to its existing array and preserve their secret references. The URL and complete publication ID follow the selected model, while its display name uses the original model name. Input/output limits of 256000/16000 are example budgets, not discovered capabilities; adjust them to the model's actual limits.

Tool calling and vision follow the publication's declared capabilities; tool-capable publications without streaming tool support use `streaming: false`. Selecting Enabled or Disabled in the example controls adds the thinking menu fields; Default omits them. The actual on/off choice is made in VS Code's menu. For a publication that declares tool calling, vision and streaming tool calls, the complete configuration looks like this:

```json
[
  {
    "name": "Xpert Model Gateway",
    "vendor": "customendpoint",
    "apiKey": "YOUR_API_KEY",
    "apiType": "chat-completions",
    "models": [
      {
        "id": "xirang/deepseek-v4.1-flash-1017",
        "name": "deepseek-v4.1-flash-1017",
        "url": "https://YOUR_XPERT_HOST/api/openai/v1/chat/completions",
        "maxInputTokens": 256000,
        "maxOutputTokens": 16000,
        "toolCalling": true,
        "vision": true,
        "streaming": true,
        "thinking": true,
        "supportsReasoningEffort": ["none", "high"],
        "reasoningEffortFormat": "chat-completions"
      }
    ]
  }
]
```

The configuration-level `thinking: true` declares capability; it is not the API request's `thinking` object. Select `none` in the native Thinking Effort menu to disable Xirang thinking, or `high` to enable it. Only two choices are advertised because Xirang's declared control is boolean. Do not put arbitrary `thinking` fields inside `modelOptions`; the inspected VS Code 1.142 implementation forwards only its supported sampling options there.

See the [VS Code model configuration reference](https://code.visualstudio.com/docs/agent-customization/language-models#model-configuration-reference). This configuration requires a gateway deployment containing this change; local tests do not establish a live VS Code or customer-environment acceptance.

## Example

Use the complete publication ID returned by `GET /api/openai/v1/models` or selected in Account → External API → Guide. Provider prefixes are part of that ID, not a prefix to add or remove automatically. For example, `deepseek-v4.1-flash-1017` and `xirang/deepseek-v4.1-flash-1017` can refer to different publications with different access and capabilities.

```sh
API_URL='https://YOUR_XPERT_HOST/api/openai/v1/chat/completions'
curl "$API_URL" \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "xirang/deepseek-v4.1-flash-1017",
    "thinking": {"type": "disabled"},
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Provider mapping and limits

The gateway normalizes the control to boolean `enable_thinking` before constructing the provider client. Xirang maps this to both `enable_thinking` and `chat_template_kwargs.enable_thinking`. An explicit `false` overrides a saved `true`; omission leaves the configured behavior intact. Each call creates its own configuration and does not update the saved model.

Thinking does not grant tool-call capabilities. A request with `tools` still requires the selected publication's tool-call capabilities. This change controls model execution; it does not add `reasoning_content` to gateway responses or support thinking budgets.
