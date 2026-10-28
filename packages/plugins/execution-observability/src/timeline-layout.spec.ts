import { executionObservationRecordSchema } from '@xpert-ai/contracts'
import {
  anchoredScroll,
  executionKind,
  makeViewport,
  packExecutions,
  plotWidth,
  TIME_SCALES
} from '../remote-components/timeline/src/timeline-layout'

describe('timeline time density and execution lanes', () => {
  const from = Date.parse('2026-10-20T00:00:00Z'),
    to = from + 7 * 86400000
  it('zooms pixels without changing the range and keeps the viewed timestamp anchored', () => {
    const viewport = 1400,
      width = plotWidth(viewport, 1),
      next = plotWidth(viewport, 8)
    const left = anchoredScroll(0, width, next, viewport)
    expect(next).toBe(width * 8)
    const before = makeViewport(from, to, to, width, 0, viewport, 'UTC')
    const after = makeViewport(from, to, to, next, left, viewport, 'UTC')
    expect((after.visibleFrom + after.visibleTo) / 2).toBe((before.visibleFrom + before.visibleTo) / 2)
    expect(after.visibleTo - after.visibleFrom).toBe((to - from) / 8)
    expect(anchoredScroll(left, next, width, viewport)).toBe(0)
  })
  it('bounds tick rendering even at 64× and clamps the scroll anchor at either edge', () => {
    for (const scale of TIME_SCALES) {
      const width = plotWidth(1400, scale)
      const view = makeViewport(from, to, to, width, width / 3, 1400, 'UTC')
      expect(view.ticks.length).toBeLessThan(12)
      expect(view.ticks.every((tick) => tick >= from && tick <= to)).toBe(true)
    }
    expect(anchoredScroll(-1000, 1000, 2000, 1400)).toBe(0)
    expect(anchoredScroll(10000, 1000, 2000, 1400)).toBe(904)
  })
  it('stacks overlapping root and child executions but reuses a lane at a half-open end', () => {
    const record = (id: string, start: number, end: number, parentId: string | null = null) =>
      executionObservationRecordSchema.parse({
        id,
        assistantId: null,
        assistantName: null,
        workspaceId: null,
        workspaceName: null,
        conversationId: 'conversation',
        threadId: 'same-thread',
        parentThreadId: null,
        forkedFromMessageId: null,
        title: id,
        status: 'success',
        createdAt: new Date(from + start).toISOString(),
        completedAt: new Date(from + end).toISOString(),
        endKnown: true,
        hasError: false,
        timingBasis: 'record_lifecycle',
        phasesAvailable: false,
        elapsedTimeMs: end - start,
        parentId,
        invocationKind: parentId ? 'sub_agent' : null,
        source: null,
        recordedById: null
      })
    const root = record('root', 0, 100),
      child = record('child', 20, 50, 'root'),
      next = record('next', 100, 200)
    const packed = packExecutions([next, child, root], { from, to, asOf: to })
    expect(packed.map(({ record, lane }) => [record.id, lane])).toEqual([
      ['root', 0],
      ['child', 1],
      ['next', 0]
    ])
    expect(executionKind(root)).toBe('rootExecution')
    expect(executionKind(child)).toBe('subAgent')
    expect(child.parentThreadId).toBeNull()
  })
})
