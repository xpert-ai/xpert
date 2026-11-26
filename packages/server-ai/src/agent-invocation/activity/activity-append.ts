// Plan against a committed waterline. File writes happen before a short CAS transaction;
// no activity or output reference becomes visible until its cursor commits with the rows.
import { createHash, randomUUID } from 'node:crypto'
import { executionActivityItemSchema, type ExecutionActivityItem, type ExecutionActivityGap } from '@xpert-ai/contracts'
import { redactCredentials } from '../../shared/redact-credentials'
import type { InvocationActivityItem, InvocationActivityState } from './activity.entity'

export type ActivityIdentity = Pick<InvocationActivityState, 'id' | 'tenantId' | 'organizationId'>
type ItemRecord = Pick<
    InvocationActivityItem,
    'id' | 'tenantId' | 'organizationId' | 'invocationId' | 'itemId' | 'seq' | 'firstSeq' | 'hash' | 'item'
>

export function sanitizeActivityItems(items: ExecutionActivityItem[]) {
    return items.map((raw) => {
        const item = executionActivityItemSchema.parse(
            JSON.parse(JSON.stringify(raw), (_key, value) =>
                typeof value === 'string' ? redactCredentials(value) : value
            )
        )
        if (item.content.kind === 'tool') delete item.content.outputRef
        return item
    })
}

export function planActivityAppend(
    identity: ActivityIdentity,
    snapshot: Pick<InvocationActivityState, 'seq' | 'bytes'>,
    previousRows: ItemRecord[],
    input: ExecutionActivityItem[],
    maxBytes: number
) {
    const latest = new Map(previousRows.map((row) => [row.itemId, row]))
    const rows: ItemRecord[] = []
    const outputs = new Map<string, string>()
    const gaps: ExecutionActivityGap[] = []
    let seq = snapshot.seq,
        bytes = snapshot.bytes
    for (const raw of input) {
        let item = executionActivityItemSchema.parse(raw)
        const previous = latest.get(item.id)
        if (
            item.content.kind === 'tool' &&
            item.content.status === 'running' &&
            previous?.item.content.kind === 'tool' &&
            ['succeeded', 'failed'].includes(previous.item.content.status)
        )
            continue
        if (item.content.kind === 'tool' && previous?.item.content.kind === 'tool')
            item = executionActivityItemSchema.parse({
                ...item,
                content: { ...previous.item.content, ...item.content }
            })
        if (item.content.kind === 'tool' && raw.content.kind === 'tool' && raw.content.output !== undefined)
            delete item.content.outputRef
        const completeOutput = item.content.kind === 'tool' ? item.content.output : undefined
        const archived = !!completeOutput && completeOutput.length > 65536
        if (item.content.kind === 'tool' && archived) {
            item.content.outputRef = {
                key: createHash('sha256').update(completeOutput).digest('hex'),
                length: completeOutput.length
            }
            item.content.output = completeOutput.slice(0, 65536)
        }
        item = executionActivityItemSchema.parse(item)
        const json = JSON.stringify(item),
            hash = createHash('sha256').update(json).digest('hex')
        if (previous?.hash === hash) continue
        const size = Buffer.byteLength(json) + (archived ? Buffer.byteLength(completeOutput) : 0)
        if (bytes + size > maxBytes || seq >= 20000) {
            if (!gaps.includes('capture_limit')) gaps.push('capture_limit')
            continue
        }
        if (item.content.kind === 'tool' && archived && item.content.outputRef)
            outputs.set(item.content.outputRef.key, completeOutput)
        seq++
        bytes += size
        const row = {
            id: randomUUID(),
            tenantId: identity.tenantId,
            organizationId: identity.organizationId,
            invocationId: identity.id,
            itemId: item.id,
            seq,
            firstSeq: previous?.firstSeq ?? seq,
            hash,
            item
        }
        rows.push(row)
        latest.set(item.id, row)
    }
    return { rows, outputs, seq, bytes, gaps }
}
