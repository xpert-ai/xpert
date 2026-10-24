import { createHash } from 'node:crypto'
const id = (key) => {
    const hex = createHash('sha256').update(`pipeline-preview:${key}`).digest('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
export function createPipelineConfigurationPreview() {
    const graph = createPipelinePreview(),
        template = graph.definition
    const configuration = {
        schemaVersion: 1,
        template,
        binding: {
            templateRef: `${template.key}@${template.version}`,
            roleBindings: {
                research: { kind: 'assistant', selectionKey: id('assistant') },
                reviewer: { kind: 'human', selectionKey: 'project-managers' }
            },
            parameters: { requireReferences: true, acceptedFormats: ['PDF', 'DOCX'] },
            ...(template.executionAuthority === 'platform'
                ? {
                      executorBindings: {
                          research: { kind: 'assistant', roleKey: 'research', selectionKey: 'select-assistant' }
                      },
                      limits: { maxConcurrentExecutions: 2, maxTechnicalAttemptsPerNode: 2, runTimeoutMinutes: 60 }
                  }
                : {})
        }
    }
    return {
        canManage: true,
        commandCapability: { allowed: true },
        hostCapabilities: {
            protocols: [1],
            features: {
                'pipeline.core': [1],
                'pipeline.managed': [1],
                'pipeline.assistant': [1],
                'pipeline.provider_projection': [1]
            }
        },
        assistants: [
            { id: id('assistant'), name: '技术资料分析助手', publishedVersion: '1.0.0' },
            { id: id('assistant2'), name: '独立复核助手', publishedVersion: '2.0.0' }
        ],
        items: [
            {
                contributionKey: 'neutral.preview',
                configuration,
                ...(template.executionAuthority === 'platform'
                    ? {
                          form: {
                              templateRef: configuration.binding.templateRef,
                              description: {
                                  en_US: 'Analyze technical documents, verify references and request human approval.',
                                  zh_Hans: '分析技术资料、核对引用并提交人工审核。'
                              },
                              assistantSlots: [
                                  { slot: 'research', label: { en_US: 'Document analyst', zh_Hans: '技术分析智能体' } }
                              ],
                              parameters: [
                                  {
                                      key: 'requireReferences',
                                      type: 'boolean',
                                      label: { en_US: 'Require source references', zh_Hans: '要求提供来源引用' }
                                  },
                                  {
                                      key: 'acceptedFormats',
                                      type: 'multi_choice',
                                      minItems: 1,
                                      label: { en_US: 'Accepted formats', zh_Hans: '接受的文档格式' },
                                      options: ['PDF', 'DOCX', 'TXT'].map((value) => ({
                                          value,
                                          label: { en_US: value }
                                      }))
                                  }
                              ]
                          }
                      }
                    : {})
            }
        ]
    }
}
export function createPipelinePreview() {
    const now = Date.now(),
        at = (minutes) => new Date(now + minutes * 60000).toISOString()
    const source = [
        {
            key: 'source',
            title: '资料准备',
            stage: 'prepare',
            lane: 'research',
            lifecycle: 'completed',
            readiness: 'ready',
            runtime: 'succeeded'
        },
        {
            key: 'analysis',
            title: '技术分析',
            stage: 'analyze',
            lane: 'research',
            lifecycle: 'active',
            readiness: 'ready',
            runtime: 'running'
        },
        {
            key: 'verify',
            title: '证据复核',
            stage: 'analyze',
            lane: 'research',
            lifecycle: 'active',
            readiness: 'blocked',
            runtime: 'unknown'
        },
        {
            key: 'route',
            title: '检查结果',
            stage: 'review',
            lane: null,
            kind: 'router',
            lifecycle: 'pending',
            readiness: 'waiting',
            runtime: 'none'
        },
        {
            key: 'approval',
            title: '人工审核',
            stage: 'review',
            lane: 'reviewer',
            kind: 'human_gate',
            lifecycle: 'active',
            readiness: 'ready',
            runtime: 'none'
        },
        {
            key: 'archive',
            title: '归档',
            stage: 'deliver',
            lane: null,
            kind: 'terminal',
            lifecycle: 'pending',
            readiness: 'waiting',
            runtime: 'none'
        }
    ]
    const tasks = source
        .filter((node) => node.lane)
        .map((node) => ({
            id: id(node.key),
            title: node.title,
            status: node.lifecycle === 'completed' ? 'done' : node.readiness === 'blocked' ? 'blocked' : 'in_progress',
            kind: 'task',
            providerKey: 'neutral.preview@1',
            controlKind: 'provider',
            pipelineInstanceId: id('instance'),
            sourceKey: node.key,
            revision: 1,
            parentTaskId: null,
            predecessorIds: [],
            plannedStartAt: null,
            plannedEndAt: null,
            estimatedDurationMs: null,
            actualStartAt: null,
            actualEndAt: null,
            diagnostic: null,
            assigneeXpertId: node.lane === 'research' ? id('assistant') : null,
            assigneeName: node.lane === 'research' ? '技术分析 Assistant' : null,
            assigneeAvatar: { emoji: { id: 'memo', unified: '1f4dd' } }
        }))
    const attempt = (key, number, state, start, end) => ({
        id: id(`${key}:${number}`),
        taskId: id(key),
        attempt: number,
        status: state,
        runtimeStatus: state,
        agentExecutionId: id(`${key}:execution:${number}`),
        runtimeStartedAt: start,
        runtimeCompletedAt: end
    })
    const graph = {
        projectId: id('project'),
        instance: {
            id: id('instance'),
            title: '技术资料审核 · 预览数据',
            authority: 'provider',
            ownerRef: 'neutral.preview@1',
            sourceKey: 'case-1',
            revision: 1,
            updatedAt: at(0)
        },
        cursor: 'preview-1',
        definition: {
            key: 'neutral.preview',
            version: '1.0.0',
            title: '技术资料审核',
            executionAuthority: 'provider',
            providerRef: 'neutral.preview@1',
            projectTypes: [{ applicationKey: 'platform', projectTypeKey: 'general' }],
            subjectResolverRef: 'neutral.subject@1',
            topology: { source: 'provider', presentationAdapterRef: 'neutral.presentation@1' },
            roles: [
                { key: 'research', allowedKinds: ['assistant'] },
                { key: 'reviewer', allowedKinds: ['human'] }
            ],
            lanes: [
                { key: 'research', roleKey: 'research', label: '技术分析', order: 0 },
                { key: 'reviewer', roleKey: 'reviewer', label: '审核负责人', order: 1 }
            ],
            stages: ['prepare', 'analyze', 'review', 'deliver'].map((key, order) => ({
                key,
                label: ['资料准备', '分析复核', '审核确认', '交付归档'][order],
                order
            }))
        },
        runId: id('run'),
        roundId: id('round'),
        round: { sequence: 1, generation: 1, state: 'active', inputDigest: 'a'.repeat(64) },
        nodes: source.map((node) => ({
            id: id(`node:${node.key}`),
            taskIds: node.lane ? [id(node.key)] : [],
            projection: {
                key: node.key,
                nodeKey: node.key,
                expansionKey: 'root',
                title: node.title,
                kind: node.kind ?? 'work',
                laneKey: node.lane,
                stageKey: node.stage,
                state: {
                    lifecycle: node.lifecycle,
                    readiness: node.readiness,
                    runtime: node.runtime,
                    applicability: 'selected',
                    freshness: 'current'
                },
                taskKeys: node.lane ? [node.key] : [],
                evidence: []
            }
        })),
        edges: [
            ['source', 'analysis'],
            ['source', 'verify'],
            ['analysis', 'route'],
            ['verify', 'route'],
            ['route', 'approval'],
            ['approval', 'archive']
        ].map(([from, to], index) => ({
            key: `edge-${index}`,
            from,
            to,
            selection: index < 2 ? 'selected' : 'undetermined'
        })),
        tasks: {
            projectId: id('project'),
            projectTitle: '通用流程预览',
            cursor: '1',
            canEditPlan: false,
            diagnostics: [],
            tasks,
            executions: [
                attempt('source', 1, 'succeeded', at(-55), at(-35)),
                attempt('analysis', 1, 'failed', at(-34), at(-25)),
                attempt('analysis', 2, 'running', at(-20), null),
                attempt('verify', 1, 'unknown', null, null)
            ]
        }
    }
    if (process.env.TASKS_PREVIEW_SCENARIO === 'pipeline-layout') {
        for (let index = 2; index <= 8; index++) {
            const task = {
                ...graph.tasks.tasks[0],
                id: id(`layout-task-${index}`),
                assigneeXpertId: id(`layout-assistant-${index}`),
                assigneeName: `分析助手 ${index}`
            }
            graph.tasks.tasks.push(task)
            graph.nodes[0].taskIds.push(task.id)
        }
        graph.edges[0].label = '资料符合配置中的完整性要求并通过所有必要的质量检查后继续处理'
        graph.edges.push({
            key: 'layout-skip',
            from: 'source',
            to: 'route',
            selection: 'undetermined',
            label: '人工检查后直接进入审核确认阶段，不执行中间分析步骤'
        })
    }
    if (process.env.TASKS_PREVIEW_SCENARIO !== 'pipeline-managed') {
        graph.attentions = [
            {
                id: id('provider-attention'),
                nodeInstanceId: id('node:verify'),
                source: 'provider_action',
                kind: 'unknown',
                state: 'open',
                revision: 1,
                generation: 1,
                inputDigest: graph.round.inputDigest,
                reasonCode: 'EXECUTION_CONFIRMATION_PENDING',
                outcomes: [],
                inputEvidence: []
            }
        ]
        return graph
    }
    const { providerRef, topology, ...definition } = graph.definition
    graph.definition = {
        ...definition,
        executionAuthority: 'platform',
        topology: { source: 'definition' },
        nodes: [
            {
                key: 'source',
                kind: 'work',
                laneKey: 'research',
                stageKey: 'prepare',
                executorSlot: 'research',
                operationRef: 'neutral.prepare@1',
                completionRef: 'platform.output-validated@1'
            },
            {
                key: 'approval',
                kind: 'human_gate',
                laneKey: 'reviewer',
                stageKey: 'review',
                policyRef: 'neutral.approval@1',
                candidateRoleKey: 'reviewer',
                outcomes: ['publish', 'revise'],
                outcomeLabels: { publish: '确认归档', revise: '退回，等待新版本' }
            },
            { key: 'archive', kind: 'terminal', stageKey: 'deliver', outcome: 'completed' },
            {
                key: 'revise',
                kind: 'terminal',
                stageKey: 'deliver',
                outcome: 'revision',
                disposition: 'await_new_subject'
            }
        ],
        edges: [
            { from: 'source', to: 'approval' },
            { from: 'approval', to: 'archive', outcome: 'publish' },
            { from: 'approval', to: 'revise', outcome: 'revise' }
        ],
        roundPolicy: {
            entryNodeKey: 'source',
            maxRounds: 3,
            onRework: 'await_new_subject_then_next_round',
            onLimit: 'attention',
            newVersionWhileActive: 'supersede_round',
            terminalOutcomes: ['completed']
        },
        failurePolicy: { requiredNodeFailure: 'block_and_attention', unknownExecution: 'inspect_without_replay' }
    }
    graph.instance.authority = 'platform'
    graph.runState = 'active'
    graph.actions = { cancel: true, retries: [] }
    graph.permissions = { canEdit: true, canManage: true }
    graph.nodes = graph.nodes.filter((node) => ['source', 'approval', 'archive'].includes(node.projection.key))
    const terminal = structuredClone(graph.nodes.find((node) => node.projection.key === 'archive'))
    terminal.id = id('node:revise')
    terminal.projection.key = terminal.projection.nodeKey = 'revise'
    terminal.projection.title = '等待新版本'
    graph.nodes.push(terminal)
    for (const node of graph.nodes)
        if (node.projection.kind === 'terminal') node.projection.state.applicability = 'undetermined'
    graph.edges = graph.definition.edges.map((edge, index) => ({
        ...edge,
        key: `edge-${index}`,
        selection: index ? 'undetermined' : 'selected'
    }))
    const evidence = {
        resolverRef: 'neutral.evidence@1',
        schemaRef: 'neutral.document@1',
        objectKey: 'review-result',
        version: '1',
        digest: 'a'.repeat(64),
        producerOperationId: id('source-operation')
    }
    graph.attentions = [
        {
            id: id('attention'),
            nodeInstanceId: id('node:approval'),
            kind: 'human',
            state: 'open',
            revision: 1,
            generation: 1,
            inputDigest: graph.round.inputDigest,
            reasonCode: 'HUMAN_DECISION_REQUIRED',
            outcomes: ['publish', 'revise'],
            inputEvidence: [evidence]
        }
    ]
    graph.nodes[0].projection.evidence = [evidence]
    graph.tasks.tasks = graph.tasks.tasks.filter((task) => ['source', 'approval'].some((key) => id(key) === task.id))
    graph.tasks.executions = graph.tasks.executions.filter((attempt) => attempt.taskId === id('source'))
    return graph
}

export function createPipelineHistoryPreview(current) {
    const historical = structuredClone(current)
    historical.runId = id('history-run')
    historical.roundId = id('history-round')
    historical.round = { ...historical.round, sequence: 1, state: 'completed' }
    historical.cursor = 'historical-preview'
    historical.historical = true
    historical.historyComplete = true
    historical.runState = 'completed'
    historical.snapshotAt = new Date(Date.parse(current.instance.updatedAt) - 86400000).toISOString()
    historical.permissions = { canEdit: false, canManage: false }
    historical.actions = { cancel: false, retries: [] }
    historical.attentions = []
    if (historical.instance.authority === 'platform') {
        for (const node of historical.nodes)
            if (node.projection.kind === 'terminal')
                node.projection.state.applicability = node.projection.key === 'archive' ? 'selected' : 'excluded'
        for (const edge of historical.edges) edge.selection = edge.to === 'revise' ? 'excluded' : 'selected'
    }
    historical.nodes.forEach((node) => {
        node.projection.state =
            node.projection.state.applicability === 'selected'
                ? {
                      ...node.projection.state,
                      lifecycle: 'completed',
                      readiness: 'ready',
                      runtime: node.projection.kind === 'work' ? 'succeeded' : 'none'
                  }
                : { ...node.projection.state, applicability: 'excluded', runtime: 'none' }
    })
    historical.tasks.tasks.forEach((task) => {
        task.status = 'done'
        task.id = id(`history:${task.id}`)
    })
    historical.nodes.forEach((node) => {
        node.id = id(`history:${node.id}`)
        node.taskIds = node.taskIds.map((taskId) => id(`history:${taskId}`))
    })
    historical.tasks.executions.forEach((attempt) => {
        attempt.id = id(`history:${attempt.id}`)
        attempt.taskId = id(`history:${attempt.taskId}`)
        if (attempt.agentExecutionId) attempt.agentExecutionId = id(`history:${attempt.agentExecutionId}`)
        for (const key of ['runtimeStartedAt', 'runtimeCompletedAt'])
            if (attempt[key]) attempt[key] = new Date(Date.parse(attempt[key]) - 86400000).toISOString()
    })
    return historical
}
