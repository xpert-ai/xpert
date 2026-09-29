// Invariants: host preparation never executes; approval remains bound to exact arguments on both sides.
import { interrupt } from '@langchain/langgraph'
import { t } from 'i18next'
import type { ShellPreparationRequest, ShellPreparation } from '@xpert-ai/contracts'
import { isId } from '@xpert-ai/desktop-protocol'
import type { ClientToolRequest, ClientToolResponse, HITLRequest, HITLResponse } from '@xpert-ai/chatkit-types'
import { shellError } from './desktop-shell.errors'

function preparation(value: unknown): ShellPreparation {
    if (
        !value ||
        typeof value !== 'object' ||
        !('kind' in value) ||
        value.kind !== 'desktop-shell' ||
        !('grantId' in value) ||
        !isId(value.grantId) ||
        !('deviceName' in value) ||
        typeof value.deviceName !== 'string' ||
        !('cwd' in value) ||
        typeof value.cwd !== 'string' ||
        !value.cwd.startsWith('/') ||
        !('expiresAt' in value) ||
        typeof value.expiresAt !== 'number' ||
        !Number.isFinite(value.expiresAt) ||
        value.expiresAt <= Date.now() ||
        !('decision' in value) ||
        (value.decision !== 'pending' && value.decision !== 'approved')
    )
        shellError('GRANT_REVOKED', 403)
    return {
        kind: value.kind,
        grantId: value.grantId,
        deviceName: value.deviceName,
        cwd: value.cwd,
        expiresAt: value.expiresAt,
        decision: value.decision
    }
}
export async function requestShellApproval(input: ShellPreparationRequest): Promise<ShellPreparation | null> {
    const callId = `${input.toolCallId}:prepare`
    const request: ClientToolRequest = {
        clientToolCalls: [{ id: callId, name: 'desktop_shell_prepare', args: { ...input } }]
    }
    const response = (await interrupt(request)) as ClientToolResponse
    const message = response?.toolMessages?.find((item) => item.tool_call_id === callId)
    if (!message || message.status === 'error') return null
    if (typeof message.content !== 'string') shellError('INVALID_MESSAGE')
    const ready = preparation(JSON.parse(message.content))
    if (ready.decision === 'approved') return ready
    const approval: HITLRequest & { host: { kind: string; id: string; expiresAt: number }; toolCallId: string } = {
        host: { kind: 'desktop-shell', id: ready.grantId, expiresAt: ready.expiresAt },
        toolCallId: input.toolCallId,
        actionRequests: [
            {
                name: 'desktop_shell',
                args: { command: input.command, cwd: ready.cwd, timeoutSec: input.timeoutSec },
                display: {
                    title: t('server-ai:DesktopShell.ApprovalTitle', {
                        defaultValue: 'Allow this command on your computer?'
                    }),
                    summary: ready.deviceName,
                    sections: [
                        {
                            type: 'text',
                            label: t('server-ai:DesktopShell.Directory', { defaultValue: 'Working directory' }),
                            text: ready.cwd
                        },
                        {
                            type: 'code',
                            label: t('server-ai:DesktopShell.Command', { defaultValue: 'Command' }),
                            code: input.command
                        },
                        {
                            type: 'text',
                            label: t('server-ai:DesktopShell.Access', { defaultValue: 'Local access' }),
                            text: t('server-ai:DesktopShell.ApprovalNotice', {
                                defaultValue:
                                    'Runs as your computer user. Output is sent to Xpert. The working directory does not restrict file access.'
                            })
                        }
                    ]
                }
            }
        ],
        reviewConfigs: [{ actionName: 'desktop_shell', allowedDecisions: ['approve', 'reject'] }]
    }
    const decision = (await interrupt(approval)) as HITLResponse
    if (decision?.decisions?.length !== 1 || decision.decisions[0].type !== 'approve') return null
    return ready
}
