type MetricLabelValue = string | number | boolean | null | undefined
type MetricLabels = Record<string, string>
type MetricType = 'counter' | 'gauge' | 'histogram'

const DEFAULT_DURATION_BUCKETS = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300]
const LLM_LATENCY_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60]

type ChatMetricInput = {
    action?: MetricLabelValue
    from?: MetricLabelValue
    status?: MetricLabelValue
    durationMs?: number | null
}

type AgentExecutionMetricInput = {
    status?: MetricLabelValue
    category?: MetricLabelValue
    nodeType?: MetricLabelValue
    durationMs?: number | null
}

type LlmUsageMetricInput = {
    provider?: MetricLabelValue
    model?: MetricLabelValue
    inputTokens?: number | null
    outputTokens?: number | null
    totalTokens?: number | null
    totalPrice?: number | null
    currency?: MetricLabelValue
    responseLatencySeconds?: number | null
}

type ToolMessageMetricInput = {
    toolset?: unknown
    tool?: unknown
    status?: unknown
    created_date?: unknown
    end_date?: unknown
}

type ToolComponentMetricInput = {
    id?: unknown
    type?: unknown
    data?: unknown
}

class CounterMetric {
    private readonly samples = new Map<string, { labels: MetricLabels; value: number }>()

    constructor(
        private readonly name: string,
        private readonly help: string
    ) {}

    inc(labels: Record<string, MetricLabelValue>, value = 1) {
        const amount = toPositiveFiniteNumber(value)
        if (amount === null) {
            return
        }
        const normalizedLabels = normalizeLabels(labels)
        const key = labelKey(normalizedLabels)
        const current = this.samples.get(key)
        this.samples.set(key, {
            labels: normalizedLabels,
            value: (current?.value ?? 0) + amount
        })
    }

    reset() {
        this.samples.clear()
    }

    render() {
        return renderMetricFamily(this.name, this.help, 'counter', Array.from(this.samples.values()))
    }
}

class GaugeMetric {
    private readonly samples = new Map<string, { labels: MetricLabels; value: number }>()

    constructor(
        private readonly name: string,
        private readonly help: string
    ) {}

    inc(labels: Record<string, MetricLabelValue>, value = 1) {
        this.add(labels, value)
    }

    dec(labels: Record<string, MetricLabelValue>, value = 1) {
        this.add(labels, -value)
    }

    set(labels: Record<string, MetricLabelValue>, value: number) {
        const amount = toFiniteNumber(value)
        if (amount === null) {
            return
        }
        const normalizedLabels = normalizeLabels(labels)
        this.samples.set(labelKey(normalizedLabels), {
            labels: normalizedLabels,
            value: amount
        })
    }

    private add(labels: Record<string, MetricLabelValue>, value: number) {
        const amount = toFiniteNumber(value)
        if (amount === null) {
            return
        }
        const normalizedLabels = normalizeLabels(labels)
        const key = labelKey(normalizedLabels)
        const current = this.samples.get(key)
        this.samples.set(key, {
            labels: normalizedLabels,
            value: Math.max(0, (current?.value ?? 0) + amount)
        })
    }

    reset() {
        this.samples.clear()
    }

    render() {
        return renderMetricFamily(this.name, this.help, 'gauge', Array.from(this.samples.values()))
    }
}

class HistogramMetric {
    private readonly samples = new Map<
        string,
        {
            labels: MetricLabels
            buckets: Map<number, number>
            count: number
            sum: number
        }
    >()

    constructor(
        private readonly name: string,
        private readonly help: string,
        private readonly buckets: number[] = DEFAULT_DURATION_BUCKETS
    ) {}

    observe(labels: Record<string, MetricLabelValue>, value: number) {
        const amount = toPositiveFiniteNumber(value, true)
        if (amount === null) {
            return
        }
        const normalizedLabels = normalizeLabels(labels)
        const key = labelKey(normalizedLabels)
        const sample = this.samples.get(key) ?? {
            labels: normalizedLabels,
            buckets: new Map(this.buckets.map((bucket) => [bucket, 0])),
            count: 0,
            sum: 0
        }

        for (const bucket of this.buckets) {
            if (amount <= bucket) {
                sample.buckets.set(bucket, (sample.buckets.get(bucket) ?? 0) + 1)
            }
        }
        sample.count += 1
        sample.sum += amount
        this.samples.set(key, sample)
    }

    reset() {
        this.samples.clear()
    }

    render() {
        const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`]
        for (const sample of this.samples.values()) {
            for (const bucket of this.buckets) {
                lines.push(
                    `${this.name}_bucket${formatLabels({ ...sample.labels, le: formatNumber(bucket) })} ${formatNumber(
                        sample.buckets.get(bucket) ?? 0
                    )}`
                )
            }
            lines.push(
                `${this.name}_bucket${formatLabels({ ...sample.labels, le: '+Inf' })} ${formatNumber(sample.count)}`
            )
            lines.push(`${this.name}_sum${formatLabels(sample.labels)} ${formatNumber(sample.sum)}`)
            lines.push(`${this.name}_count${formatLabels(sample.labels)} ${formatNumber(sample.count)}`)
        }
        return lines.join('\n')
    }
}

export class ApplicationMetricsRegistry {
    private readonly info = new GaugeMetric('xpert_metrics_info', 'Xpert metrics endpoint information.')
    private readonly chatRequests = new CounterMetric(
        'xpert_chat_requests_total',
        'Total queued or executed Xpert chat requests.'
    )
    private readonly activeChats = new GaugeMetric(
        'xpert_chat_active_conversations',
        'Active Xpert chat conversations.'
    )
    private readonly chatDuration = new HistogramMetric('xpert_chat_duration_seconds', 'Xpert chat request duration.')
    private readonly agentExecutions = new CounterMetric(
        'xpert_agent_executions_total',
        'Total Xpert agent executions.'
    )
    private readonly agentExecutionDuration = new HistogramMetric(
        'xpert_agent_execution_duration_seconds',
        'Xpert agent execution duration.'
    )
    private readonly llmTokens = new CounterMetric('xpert_llm_tokens_total', 'Total Xpert LLM tokens.')
    private readonly llmCost = new CounterMetric('xpert_llm_cost_total', 'Total Xpert LLM cost.')
    private readonly llmResponseLatency = new HistogramMetric(
        'xpert_llm_response_latency_seconds',
        'Xpert LLM provider response latency.',
        LLM_LATENCY_BUCKETS
    )
    private readonly toolCalls = new CounterMetric('xpert_tool_calls_total', 'Total Xpert tool calls.')
    private readonly toolDuration = new HistogramMetric('xpert_tool_duration_seconds', 'Xpert tool call duration.')

    constructor() {
        this.reset()
    }

    reset() {
        this.info.reset()
        this.chatRequests.reset()
        this.activeChats.reset()
        this.chatDuration.reset()
        this.agentExecutions.reset()
        this.agentExecutionDuration.reset()
        this.llmTokens.reset()
        this.llmCost.reset()
        this.llmResponseLatency.reset()
        this.toolCalls.reset()
        this.toolDuration.reset()
        this.info.set({ service: process.env.OTEL_SERVICE_NAME || process.env.SERVICE_NAME || 'xpert-api' }, 1)
    }

    startChat(input: Pick<ChatMetricInput, 'from'>) {
        this.activeChats.inc({ from: labelValue(input.from) })
    }

    finishChat(input: Required<Pick<ChatMetricInput, 'status'>> & ChatMetricInput) {
        this.activeChats.dec({ from: labelValue(input.from) })
        this.recordChatRequest(input)
    }

    recordChatRequest(input: Required<Pick<ChatMetricInput, 'status'>> & ChatMetricInput) {
        const labels = {
            action: labelValue(input.action),
            from: labelValue(input.from),
            status: labelValue(input.status)
        }
        this.chatRequests.inc(labels)
        this.observeDuration(this.chatDuration, { action: labels.action, status: labels.status }, input.durationMs)
    }

    recordAgentExecution(input: Required<Pick<AgentExecutionMetricInput, 'status'>> & AgentExecutionMetricInput) {
        const labels = {
            category: labelValue(input.category),
            node_type: labelValue(input.nodeType),
            status: labelValue(input.status)
        }
        this.agentExecutions.inc(labels)
        this.observeDuration(this.agentExecutionDuration, labels, input.durationMs)
    }

    recordLlmUsage(input: LlmUsageMetricInput) {
        const provider = labelValue(input.provider)
        const model = labelValue(input.model)
        this.recordTokenDirection(provider, model, 'input', input.inputTokens)
        this.recordTokenDirection(provider, model, 'output', input.outputTokens)
        this.recordTokenDirection(provider, model, 'total', input.totalTokens)

        const price = toPositiveFiniteNumber(input.totalPrice)
        if (price !== null) {
            this.llmCost.inc(
                {
                    currency: labelValue(input.currency),
                    model,
                    provider
                },
                price
            )
        }

        const latency = toPositiveFiniteNumber(input.responseLatencySeconds, true)
        if (latency !== null) {
            this.llmResponseLatency.observe({ model, provider }, latency)
        }
    }

    recordToolMessage(input: unknown) {
        if (!isToolMessageMetricInput(input)) {
            return
        }
        const status = stringValue(input.status)
        if (!status || status === 'running') {
            return
        }
        const labels = {
            status,
            tool: labelValue(input.tool),
            toolset: labelValue(input.toolset)
        }
        this.toolCalls.inc(labels)

        const duration = eventDurationSeconds(input.created_date, input.end_date)
        if (duration !== null) {
            this.toolDuration.observe(labels, duration)
        }
    }

    recordToolComponentMessage(input: unknown, previousContent: unknown) {
        const component = toolComponentMetricInput(input)
        if (!component) {
            return
        }

        const data = toolMessageMetricInput(component.data)
        if (!data) {
            return
        }

        const status = stringValue(data.status)
        if (!status || status === 'running') {
            return
        }

        const previousData = findToolComponentData(previousContent, component.id)
        const previousStatus = stringValue(previousData?.status)
        if (previousStatus && previousStatus !== 'running') {
            return
        }

        this.recordToolMessage(mergeToolMessageMetricInput(previousData, data))
    }

    render() {
        return (
            [
                this.info.render(),
                this.chatRequests.render(),
                this.activeChats.render(),
                this.chatDuration.render(),
                this.agentExecutions.render(),
                this.agentExecutionDuration.render(),
                this.llmTokens.render(),
                this.llmCost.render(),
                this.llmResponseLatency.render(),
                this.toolCalls.render(),
                this.toolDuration.render()
            ].join('\n') + '\n'
        )
    }

    private recordTokenDirection(provider: string, model: string, direction: string, value: number | null | undefined) {
        const amount = toPositiveFiniteNumber(value)
        if (amount === null) {
            return
        }
        this.llmTokens.inc({ direction, model, provider }, amount)
    }

    private observeDuration(
        histogram: HistogramMetric,
        labels: Record<string, MetricLabelValue>,
        durationMs: number | null | undefined
    ) {
        const value = toPositiveFiniteNumber(durationMs, true)
        if (value === null) {
            return
        }
        histogram.observe(labels, value / 1000)
    }
}

export const applicationMetrics = new ApplicationMetricsRegistry()

function renderMetricFamily(
    name: string,
    help: string,
    type: MetricType,
    samples: Array<{ labels: MetricLabels; value: number }>
) {
    const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`]
    for (const sample of samples) {
        lines.push(`${name}${formatLabels(sample.labels)} ${formatNumber(sample.value)}`)
    }
    return lines.join('\n')
}

function normalizeLabels(labels: Record<string, MetricLabelValue>): MetricLabels {
    return Object.keys(labels)
        .sort()
        .reduce<MetricLabels>((acc, key) => {
            acc[key] = labelValue(labels[key])
            return acc
        }, {})
}

function labelKey(labels: MetricLabels) {
    return Object.entries(labels)
        .map(([key, value]) => `${key}=${value}`)
        .join(',')
}

function formatLabels(labels: MetricLabels) {
    const entries = Object.entries(labels)
    if (!entries.length) {
        return ''
    }
    return `{${entries.map(([key, value]) => `${key}="${escapeLabelValue(value)}"`).join(',')}}`
}

function escapeLabelValue(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"')
}

function labelValue(value: MetricLabelValue | unknown) {
    const string = stringValue(value)
    return string?.trim() || 'unknown'
}

function stringValue(value: unknown) {
    if (typeof value === 'string') {
        return value
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value)
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false'
    }
    return null
}

function toFiniteNumber(value: unknown) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null
    }
    return value
}

function toPositiveFiniteNumber(value: unknown, allowZero = false) {
    const amount = toFiniteNumber(value)
    if (amount === null || amount < 0 || (!allowZero && amount === 0)) {
        return null
    }
    return amount
}

function formatNumber(value: number) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(9)))
}

function isToolMessageMetricInput(value: unknown): value is ToolMessageMetricInput {
    const candidate = toolMessageMetricInput(value)
    if (!candidate) {
        return false
    }
    return stringValue(candidate.tool) !== null || stringValue(candidate.toolset) !== null
}

function toolMessageMetricInput(value: unknown) {
    if (!isMetricObject(value)) {
        return null
    }

    return {
        toolset: objectProperty(value, 'toolset'),
        tool: objectProperty(value, 'tool'),
        status: objectProperty(value, 'status'),
        created_date: objectProperty(value, 'created_date'),
        end_date: objectProperty(value, 'end_date')
    } satisfies ToolMessageMetricInput
}

function toolComponentMetricInput(value: unknown) {
    if (!isMetricObject(value)) {
        return null
    }
    const type = objectProperty(value, 'type')
    if (type !== 'component') {
        return null
    }

    return {
        id: objectProperty(value, 'id'),
        type,
        data: objectProperty(value, 'data')
    } satisfies ToolComponentMetricInput
}

function findToolComponentData(content: unknown, id: unknown) {
    const targetId = stringValue(id)
    if (!targetId || !Array.isArray(content)) {
        return null
    }

    for (const item of content) {
        const component = toolComponentMetricInput(item)
        if (!component || stringValue(component.id) !== targetId) {
            continue
        }
        return toolMessageMetricInput(component.data)
    }
    return null
}

function mergeToolMessageMetricInput(previous: ToolMessageMetricInput | null, incoming: ToolMessageMetricInput) {
    return {
        toolset: incoming.toolset ?? previous?.toolset,
        tool: incoming.tool ?? previous?.tool,
        status: incoming.status ?? previous?.status,
        created_date: previous?.created_date ?? incoming.created_date,
        end_date: incoming.end_date ?? previous?.end_date
    } satisfies ToolMessageMetricInput
}

function isMetricObject(value: unknown): value is object {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function objectProperty(value: object, key: string): unknown {
    return Object.getOwnPropertyDescriptor(value, key)?.value
}

function eventDurationSeconds(start: unknown, end: unknown) {
    const startTime = dateMs(start)
    const endTime = dateMs(end)
    if (startTime === null || endTime === null || endTime < startTime) {
        return null
    }
    return (endTime - startTime) / 1000
}

function dateMs(value: unknown) {
    if (value instanceof Date) {
        return value.getTime()
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value)
        const time = date.getTime()
        return Number.isNaN(time) ? null : time
    }
    return null
}
