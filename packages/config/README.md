# ocap-config

Config package for ocap server.

## Task and pipeline defaults

The shared bootstrap configuration reads these settings in development and production:

| Environment variable                        | Default                   | Allowed values               |
| ------------------------------------------- | ------------------------- | ---------------------------- |
| `XPERT_TASK_EXECUTION_MAX_DURATION_SECONDS` | `43200` (12 hours)        | Integer, 60–86400 seconds    |
| `XPERT_PIPELINE_DEFAULT_MAX_TOKENS`         | `100000000` (100 million) | Integer, 10000–1000000000000 |

Unset or blank values use the defaults; invalid values fail startup with the setting name. The typed fields are `IPluginConfig.projectExecutionOptions.taskMaxDurationSeconds` and `.pipelineMaxTokens`. Apply environment changes by restarting the API.

The duration supplies both the default and ceiling when no explicit tenant execution policy exists. Project/type settings can request a different duration within that ceiling. Persisted tenant limits still take precedence, and active attempts retain their pinned deadline. Coding Projects inherit this policy unless their project configuration explicitly specifies a duration.

Pipeline contributors declare `nativeModelBudgetPolicy` on catalog configuration declarations, separately from persisted configurations. `maxTokensDefaultSource: 'host'` opts in to the host Token default; `'configuration'` retains the declared binding default. `maximum` independently defines the three configurable budget ceilings. The host bounds an inherited Token default between the binding's reservation size and the declared Token ceiling. No policy means the existing fixed configuration and form behavior is preserved.

Forms consume the resolved default and ceilings; they do not select the inheritance policy. Contributors using a policy omit `form.nativeModelBudget` to avoid declaring two authorities for the same ceilings. Coding Project local, release and current-instance workflows opt in and use the resolved catalog for automatic startup, including when no form is present. Their ceilings remain 300 calls, 100 million Tokens and a 10000-Token reservation regardless of the host default. For example, a 25-million host default still allows a user to choose 30 million, but never more than the declared 100-million ceiling when creating a configuration. Plugins need no environment access or new host capability. Explicit user budgets and saved bindings/instances are preserved; changing the default does not increase an existing pipeline's budget.
