# Manual pipeline recovery

A current failed node exposes human actions through the existing Project node action View. Only a live human Project owner/manager can authorize recovery. A notification projects that availability into the human account's notification center and links to the exact Workbench pipeline node.

The recovery service reports explicit availability independently of display messages. Notifications remain pending while an authorized check holds its lease, and close when no action is available; failure explanations alone do not create an actionable notification.

- **Recover completed result** acquires a short fenced lease, restores the pinned execution identity and published Assistant, and calls the optional domain `reconcile` adapter. The adapter validates existing domain evidence without running another Assistant or approving business work. The host rechecks subjects, input/output evidence, completion policy, current round, conversation/delegated execution settlement and the human's permission before atomically completing the node.
- **Authorize one retry** records an immutable grant for the exact successor attempt. The coordinator consumes that identity when the normal attempt budget is exhausted; it does not increase a reusable quota. Existing retry policy, run timeout, model budget and the hard attempt ceiling remain effective.

Recovery is unavailable for ambiguous effects, active conversation turns, unsettled delegated invocations, cancelled/superseded rounds and stale node generations. Concurrent recovery is fenced. A lost response may be retried; a completed request is idempotent, and an abandoned validation lease expires after two minutes.

Original failure receipts and completion records are copied into immutable recovery-request events. Native execution identity and terminal time remain historical facts. Recovery completion advances through the ordinary coordinator, including every later human gate. No business approval is inferred from a recovery action.

Coding-specific acceptance, independent review, artifact digests, candidate binding and host installation receipt verification belong to the Coding plugin's adapter. Ordinary `coding_delivery_submit` still rejects a failed stage. No recovery rule is added to middleware context, tool wrappers or generic task decisions.
