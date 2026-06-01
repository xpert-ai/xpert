import { ApplicationMetricsRegistry, applicationMetrics } from './application-metrics'

describe('ApplicationMetricsRegistry', () => {
    it('renders Prometheus counters, gauges, and histograms for chat metrics', () => {
        const registry = new ApplicationMetricsRegistry()

        registry.startChat({ from: 'webapp' })
        registry.finishChat({ action: 'send', from: 'webapp', status: 'success', durationMs: 1250 })

        const output = registry.render()

        expect(output).toContain('# HELP xpert_chat_requests_total Total queued or executed Xpert chat requests.')
        expect(output).toContain('# TYPE xpert_chat_requests_total counter')
        expect(output).toContain('xpert_chat_requests_total{action="send",from="webapp",status="success"} 1')
        expect(output).toContain('xpert_chat_active_conversations{from="webapp"} 0')
        expect(output).toContain('xpert_chat_duration_seconds_count{action="send",status="success"} 1')
        expect(output).toContain('xpert_chat_duration_seconds_sum{action="send",status="success"} 1.25')
    })

    it('records llm usage with provider and model labels', () => {
        const registry = new ApplicationMetricsRegistry()

        registry.recordLlmUsage({
            provider: 'openai',
            model: 'gpt-4o',
            inputTokens: 12,
            outputTokens: 8,
            totalTokens: 20,
            totalPrice: 0.03,
            currency: 'USD',
            responseLatencySeconds: 0.4
        })

        const output = registry.render()

        expect(output).toContain('xpert_llm_tokens_total{direction="input",model="gpt-4o",provider="openai"} 12')
        expect(output).toContain('xpert_llm_tokens_total{direction="output",model="gpt-4o",provider="openai"} 8')
        expect(output).toContain('xpert_llm_tokens_total{direction="total",model="gpt-4o",provider="openai"} 20')
        expect(output).toContain('xpert_llm_cost_total{currency="USD",model="gpt-4o",provider="openai"} 0.03')
        expect(output).toContain('xpert_llm_response_latency_seconds_count{model="gpt-4o",provider="openai"} 1')
    })

    it('records completed tool message events and ignores running events', () => {
        const registry = new ApplicationMetricsRegistry()

        registry.recordToolMessage({
            toolset: 'browser_automation',
            tool: 'host_page_snapshot',
            status: 'running',
            created_date: new Date('2026-05-27T00:00:00.000Z')
        })
        registry.recordToolMessage({
            toolset: 'browser_automation',
            tool: 'host_page_snapshot',
            status: 'success',
            created_date: new Date('2026-05-27T00:00:00.000Z'),
            end_date: new Date('2026-05-27T00:00:02.000Z')
        })

        const output = registry.render()

        expect(output).toContain(
            'xpert_tool_calls_total{status="success",tool="host_page_snapshot",toolset="browser_automation"} 1'
        )
        expect(output).not.toContain(
            'xpert_tool_calls_total{status="running",tool="host_page_snapshot",toolset="browser_automation"}'
        )
        expect(output).toContain(
            'xpert_tool_duration_seconds_count{status="success",tool="host_page_snapshot",toolset="browser_automation"} 1'
        )
        expect(output).toContain(
            'xpert_tool_duration_seconds_sum{status="success",tool="host_page_snapshot",toolset="browser_automation"} 2'
        )
    })

    it('records completed tool component transitions without double counting', () => {
        const registry = new ApplicationMetricsRegistry()
        const runningContent = [
            {
                id: 'tool-1',
                type: 'component',
                data: {
                    toolset: 'browser_automation',
                    tool: 'host_page_snapshot',
                    status: 'running',
                    created_date: '2026-05-27T00:00:00.000Z'
                }
            }
        ]
        const completedContent = [
            {
                id: 'tool-1',
                type: 'component',
                data: {
                    toolset: 'browser_automation',
                    tool: 'host_page_snapshot',
                    status: 'success',
                    created_date: '2026-05-27T00:00:00.000Z',
                    end_date: '2026-05-27T00:00:02.000Z'
                }
            }
        ]

        registry.recordToolComponentMessage(
            {
                id: 'tool-1',
                type: 'component',
                data: {
                    status: 'success',
                    end_date: '2026-05-27T00:00:02.000Z'
                }
            },
            runningContent
        )
        registry.recordToolComponentMessage(
            {
                id: 'tool-1',
                type: 'component',
                data: {
                    status: 'success',
                    end_date: '2026-05-27T00:00:02.000Z'
                }
            },
            completedContent
        )

        const output = registry.render()

        expect(output).toContain(
            'xpert_tool_calls_total{status="success",tool="host_page_snapshot",toolset="browser_automation"} 1'
        )
        expect(output).toContain(
            'xpert_tool_duration_seconds_sum{status="success",tool="host_page_snapshot",toolset="browser_automation"} 2'
        )
    })

    it('exposes a singleton registry for instrumentation call sites', () => {
        applicationMetrics.reset()
        applicationMetrics.recordChatRequest({ action: 'follow_up', from: 'api', status: 'queued', durationMs: 10 })

        expect(applicationMetrics.render()).toContain(
            'xpert_chat_requests_total{action="follow_up",from="api",status="queued"} 1'
        )
    })
})
