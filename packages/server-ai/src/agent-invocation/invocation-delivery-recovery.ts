// Recovery reads only the authorized original workspace. It never starts a process or accepts work.
import { createHash } from 'node:crypto'
import {
    agentOutputDeliverySchema,
    AGENT_TASK_REPORT_MAX_BYTES,
    type AgentDeliveryRecovery,
    type AgentExecutionRunner,
    type AgentInvocationResult,
    type AgentInvocation
} from '@xpert-ai/plugin-sdk'
import { AgentInvocationError } from './invocation-errors'

export function hasPendingInvocationDelivery(invocation: AgentInvocation): boolean {
    const delivery = invocation.request.input.delivery
    return Boolean(
        invocation.result &&
        delivery &&
        ((delivery.reportPath && invocation.result.report?.status === 'failed') ||
            (delivery.mode !== 'none' && invocation.result.export?.status !== 'completed'))
    )
}

export async function recoverInvocationDelivery(
    invocation: AgentInvocation,
    runner: AgentExecutionRunner,
    input: AgentDeliveryRecovery
): Promise<AgentInvocationResult> {
    const receipt = invocation.handle?.runner
    if (!receipt || !invocation.result) throw new AgentInvocationError('DeliveryRecoveryUnavailable')
    const delivery = agentOutputDeliverySchema.parse(invocation.request.input.delivery ?? { mode: 'none' })
    if (delivery.mode === 'none' && input.paths) throw new AgentInvocationError('InvalidRequest')
    if (
        delivery.mode !== 'none' &&
        delivery.paths &&
        input.paths &&
        (delivery.paths.length !== input.paths.length || delivery.paths.some((path) => !input.paths.includes(path)))
    )
        throw new AgentInvocationError('InvalidRequest')
    if (invocation.result.report?.status === 'failed' && delivery.reportPath && !runner.readTaskReportFile)
        throw new AgentInvocationError('DeliveryRecoveryUnavailable')
    const result = structuredClone(invocation.result)
    result.deliveryHistory = [
        ...(result.deliveryHistory ?? []),
        { at: new Date().toISOString(), report: result.report, export: result.export }
    ]
    if (result.report?.status === 'failed' && delivery.reportPath) {
        try {
            const report = await runner.readTaskReportFile(receipt, delivery.reportPath)
            const code = !report.text.trim()
                ? 'report_empty'
                : Buffer.byteLength(report.text) > AGENT_TASK_REPORT_MAX_BYTES
                  ? 'report_too_large'
                  : undefined
            result.text = code ? '' : report.text
            result.report = code
                ? { status: 'failed', path: delivery.reportPath, code }
                : {
                      status: 'completed',
                      path: delivery.reportPath,
                      sha256: createHash('sha256').update(report.text).digest('hex')
                  }
        } catch {
            result.report = { status: 'failed', path: delivery.reportPath, code: 'report_unavailable' }
        }
    }
    if (delivery.mode !== 'none' && result.export?.status !== 'completed') {
        const selection = delivery.paths ?? input.paths ?? []
        const paths = [...new Set([...selection, ...(delivery.reportPath ? [delivery.reportPath] : [])])]
        if (!paths.length)
            result.export = { mode: delivery.mode, status: 'failed', error: 'delivery_selection_required' }
        else
            try {
                const artifacts = await runner.collectArtifacts(receipt, { mode: delivery.mode, paths })
                if (!artifacts.length) throw new AgentInvocationError('MissingResult')
                result.artifacts = artifacts
                result.export = { mode: delivery.mode, status: 'completed' }
            } catch {
                result.export = { mode: delivery.mode, status: 'failed', error: 'artifact_collection_failed' }
            }
    }
    return result
}
