import { restoreTaskView } from './view-state'
const id = '00000000-0000-4000-8000-000000000001'
it('restores view, instance, round, filter, selection and viewport after reload', () => {
    const state = {
        initialTab: 'pipeline',
        pipelineInstanceId: id,
        pipelineRoundId: id,
        pipelineMode: 'stage',
        pipelineLane: 'review',
        selectedLane: 'review',
        onlyBlocked: true,
        pipelineScale: 0.65,
        scrollLeft: 820,
        scrollTop: 64
    }
    expect(restoreTaskView(state)).toEqual(state)
})
it('gives explicit node and instance links precedence over saved state', () => {
    const saved = { initialTab: 'gantt', pipelineRoundId: id, scrollLeft: 900, onlyBlocked: true }
    expect(restoreTaskView(saved, { initialTab: 'pipeline', pipelineInstanceId: id, pipelineNodeId: id })).toEqual({
        initialTab: 'pipeline',
        pipelineInstanceId: id
    })
})
it('rejects malformed state without preventing entry and never restores configure', () => {
    expect(restoreTaskView({ scrollLeft: -1 })).toEqual({})
    expect(restoreTaskView({ initialTab: 'pipeline', configure: true })).toEqual({ initialTab: 'pipeline' })
})
