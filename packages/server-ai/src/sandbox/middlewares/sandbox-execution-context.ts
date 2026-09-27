import { SystemMessage } from '@langchain/core/messages'
import type { SandboxExecutionEnvironment } from '@xpert-ai/plugin-sdk'

export function withSandboxExecutionContext(
    systemMessage: SystemMessage | undefined,
    environment: SandboxExecutionEnvironment
): SystemMessage {
    const text = `Sandbox execution guarantees from the host: ${JSON.stringify(environment)}
Use the existing shell to inspect unspecified OS release, architecture, binaries and dependencies before installation.
Keep software and application state in declared persistent directories when they must survive environment replacement.
If system package installation is unavailable, use a compatible user-local installation or report the missing system dependency. Extracting a package does not run its installation scripts or resolve dependencies.
Preserve application sandboxes. Report missing sandbox prerequisites instead of adding no-sandbox flags or granting broader container privileges. Investigate resource limits when child processes fail to start.
Per-command shell state does not preserve cd/export between calls. Pass working directory and environment explicitly. Use managed services for background applications.
For another coding agent, prefer its supported non-interactive CLI and bounded structured output. Installation, authentication and task completion are separate checks. Never copy host credentials; let the user authenticate through the application's supported flow.`
    const content = systemMessage?.content ?? ''
    return new SystemMessage({
        content: typeof content === 'string' ? `${content}\n\n${text}` : [...content, { type: 'text', text }]
    })
}
