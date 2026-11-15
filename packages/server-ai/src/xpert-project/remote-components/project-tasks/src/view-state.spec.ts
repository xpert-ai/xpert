import { restoreTaskView } from './view-state'
const id = '00000000-0000-4000-8000-000000000001'
it('restores view, instance, round, filter, selection and viewport after reload', () => {
    const state = {
        initialTab: 'pipeline',
        pipelineInstanceId: id,
        pipelineRoundId: id,
        pipelineMode: 'stage',
        pipelineLane: 'service',
        selectedLane: 'service',
        showApprovalSteps: true,
        onlyBlocked: true,
        pipelineScale: 0.65,
        scrollLeft: 820,
        scrollTop: 64
    }
    expect(restoreTaskView(state)).toEqual(state)
    expect(restoreTaskView(state, { pipelineInstanceId: id, pipelineRoundId: id })).toEqual(state)
})
it('gives explicit node and instance links precedence over saved state', () => {
    const saved = {
        initialTab: 'gantt',
        pipelineInstanceId: id,
        pipelineLane: 'service',
        selectedLane: 'service',
        showApprovalSteps: true
    }
    const other = '00000000-0000-4000-8000-000000000002'
    expect(restoreTaskView(saved, { initialTab: 'pipeline', pipelineInstanceId: id })).toEqual({
        ...saved,
        initialTab: 'pipeline'
    })
    expect(restoreTaskView(saved, { pipelineInstanceId: other })).toEqual({ pipelineInstanceId: other })
    expect(restoreTaskView(saved, { pipelineInstanceId: id, pipelineRoundId: other })).toEqual({
        pipelineInstanceId: id,
        pipelineRoundId: other
    })
    expect(restoreTaskView(saved, { initialTab: 'pipeline', pipelineInstanceId: id, pipelineNodeId: id })).toEqual({
        initialTab: 'pipeline',
        pipelineInstanceId: id
    })
})
it('rejects malformed state without preventing entry and never restores configure', () => {
    expect(restoreTaskView({ scrollLeft: -1 })).toEqual({})
    expect(restoreTaskView({ initialTab: 'pipeline', configure: true })).toEqual({ initialTab: 'pipeline' })
})
