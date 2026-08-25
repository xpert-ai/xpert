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

    it('renders bounded MCP request, tool, auth, rate limit, task, and app metrics', () => {
        const registry = new ApplicationMetricsRegistry()

        registry.recordMcpRequest({
            authMethod: 'api_key',
            durationMs: 250,
            method: 'tools/call',
            publicationId: 'publication-1',
            status: 'success'
        })
        registry.recordMcpToolCall({
            authMethod: 'api_key',
            durationMs: 125,
            publicationId: 'publication-1',
            status: 'success',
            toolName: 'search'
        })
        registry.recordMcpAuthFailure({ authMethod: 'oauth', publicationId: 'publication-1', reason: 'audience' })
        registry.recordMcpRateLimitRejection({ publicationId: 'publication-1', scope: 'tool' })
        registry.startMcpTask({ publicationId: 'publication-1' })
        registry.finishMcpTask({ publicationId: 'publication-1' })
        registry.startMcpAppInstance({ publicationId: 'publication-1' })
        registry.finishMcpAppInstance({ publicationId: 'publication-1' })
        registry.recordMcpAppRpc({ method: 'tools/call', publicationId: 'publication-1', status: 'denied' })

        const output = registry.render()

        expect(output).toContain(
            'xpert_mcp_requests_total{auth_method="api_key",method="tools/call",publication_id="publication-1",status="success"} 1'
        )
        expect(output).toContain(
            'xpert_mcp_request_duration_seconds_sum{method="tools/call",publication_id="publication-1",status="success"} 0.25'
        )
        expect(output).toContain(
            'xpert_mcp_tool_calls_total{auth_method="api_key",publication_id="publication-1",status="success",tool_name="search"} 1'
        )
        expect(output).toContain(
            'xpert_mcp_tool_call_duration_seconds_sum{publication_id="publication-1",status="success",tool_name="search"} 0.125'
        )
        expect(output).toContain(
            'xpert_mcp_auth_failures_total{auth_method="oauth",publication_id="publication-1",reason="audience"} 1'
        )
        expect(output).toContain('xpert_mcp_rate_limit_rejections_total{publication_id="publication-1",scope="tool"} 1')
        expect(output).toContain('xpert_mcp_tasks_active{publication_id="publication-1"} 0')
        expect(output).toContain('xpert_mcp_app_instances_active{publication_id="publication-1"} 0')
        expect(output).toContain(
            'xpert_mcp_app_rpc_total{method="tools/call",publication_id="publication-1",status="denied"} 1'
        )
    })
})
