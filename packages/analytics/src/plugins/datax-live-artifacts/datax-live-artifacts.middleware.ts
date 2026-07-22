import { Injectable } from '@nestjs/common'
import { SystemMessage } from '@langchain/core/messages'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
	AgentMiddlewareStrategy,
	type AgentMiddleware,
	type IAgentMiddlewareContext,
	type IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import {
	DATA_X_LIVE_ARTIFACT_FEATURE,
	DATA_X_LIVE_ARTIFACT_ICON,
	DATA_X_LIVE_ARTIFACT_MIDDLEWARE_NAME
} from './constants'
import { DataXLiveArtifactSession } from './session'
import { createDataXLiveArtifactTools } from './tools'

@Injectable()
@AgentMiddlewareStrategy(DATA_X_LIVE_ARTIFACT_MIDDLEWARE_NAME)
export class DataXLiveArtifactsMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
	readonly meta: TAgentMiddlewareMeta = {
		name: DATA_X_LIVE_ARTIFACT_MIDDLEWARE_NAME,
		label: { en_US: 'Data X Live Artifacts', zh_Hans: 'Data X 实时分析产物' },
		description: {
			en_US: 'Creates, versions, validates, and opens secure live analytics HTML artifacts for Data X Workbench.',
			zh_Hans: '创建、版本化、校验并在 Data X Workbench 中打开安全的实时分析 HTML 产物。'
		},
		icon: { type: 'svg', value: DATA_X_LIVE_ARTIFACT_ICON, color: '#7c3aed' },
		features: [DATA_X_LIVE_ARTIFACT_FEATURE],
		configSchema: { type: 'object', properties: {}, required: [] }
	}

	createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): AgentMiddleware {
		const session = new DataXLiveArtifactSession(context)
		return {
			name: DATA_X_LIVE_ARTIFACT_MIDDLEWARE_NAME,
			tools: createDataXLiveArtifactTools(session),
			wrapModelCall: (request, handler) => {
				const existing = typeof request.systemMessage?.content === 'string' ? request.systemMessage.content : ''
				return handler({
					...request,
					systemMessage: new SystemMessage(`${existing}\n\n${LIVE_ARTIFACT_AUTHORING_PROMPT}`)
				})
			}
		}
	}
}

const LIVE_ARTIFACT_AUTHORING_PROMPT = `When the user asks for a live dashboard, live report, or interactive analytics artifact for Data X:
1. Author one complete UTF-8 HTML document in the Agent workspace. Prefer inline assets. External HTTP(S) scripts, styles, images, fonts, and media are temporarily allowed but deprecated; validation will warn because a future security upgrade will require governed, version-pinned assets. Never use external resources for business data access. Do not use fetch, XHR, WebSocket, EventSource, forms, iframes, storage, navigation, or direct postMessage.
2. Query live data only through window.dataxLiveArtifact.query(bindingId, controls). The second argument is a flat snapshot keyed by declared control IDs with primitive values; never pass Manifest params or nested objects such as window. Await window.dataxLiveArtifact.ready before the initial queries. Use window.dataxLiveArtifact.subscribe(bindingId, listener) to apply background cache revalidation updates: branch on update.ok and parse successful data from update.result.effect. Render each binding independently so one failed binding shows an inline retry/error state without hiding successful panels.
3. Declare the matching strict manifest using only mdx.query_metric_snapshot or mdx.query_cube_slice. Parameter templates may reference declared controls as \${controls.controlId}.
4. Call datax_validate_live_artifact and fix every validation issue. Validation is static and does not execute bindings, so do not describe ok: true as successful data-binding verification. Execute representative binding previews before authoring and verify the opened page actually renders live results before declaring success. Then call datax_create_live_artifact. To revise a displayed draft, write a new complete HTML file and call datax_update_live_artifact with the receipt's draftId and artifactVersionId as baseVersionId.
Never put credentials, raw query results, Artifact HTML, or unrestricted SQL/MDX in tool arguments or chat output.`
