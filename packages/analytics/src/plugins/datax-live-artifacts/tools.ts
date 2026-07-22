import { tool, type DynamicStructuredTool } from '@langchain/core/tools'
import { DataXLiveArtifactToolName } from './constants'
import {
	CreateLiveArtifactSchema,
	OpenLiveArtifactSchema,
	UpdateLiveArtifactSchema,
	ValidateLiveArtifactSchema
} from './schemas'
import { DataXLiveArtifactSession } from './session'

export function createDataXLiveArtifactTools(session: DataXLiveArtifactSession): DynamicStructuredTool[] {
	return [
		tool((input) => session.validate(input), {
			name: DataXLiveArtifactToolName.VALIDATE,
			description:
				'Perform static validation of a complete HTML file and its Phase 0 Semantic Model live-binding manifest before creating a Live Analytics Artifact. This does not execute bindings or prove that live data loads. External HTTP(S) assets are temporarily allowed but deprecated. The HTML must use window.dataxLiveArtifact.query(bindingId, flatControls) for live data and must not make direct data-network requests.',
			schema: ValidateLiveArtifactSchema,
			verboseParsingErrors: true
		}),
		tool((input) => session.create(input), {
			name: DataXLiveArtifactToolName.CREATE,
			description:
				'Create a versioned Live Analytics Artifact from a validated complete HTML file in the Agent workspace. External HTTP(S) asset warnings are preserved because this temporary compatibility path is deprecated. Use only mdx.query_metric_snapshot or mdx.query_cube_slice bindings. Returns a compact receipt and opens the live preview in Data X Workbench.',
			schema: CreateLiveArtifactSchema,
			verboseParsingErrors: true,
			responseFormat: 'content_and_artifact'
		}),
		tool((input) => session.update(input), {
			name: DataXLiveArtifactToolName.UPDATE,
			description:
				'Create a new immutable version of an existing Live Analytics Artifact. Supply the draftId and the version currently shown to the user as baseVersionId to prevent lost updates. Returns a compact receipt and replaces the Workbench preview.',
			schema: UpdateLiveArtifactSchema,
			verboseParsingErrors: true,
			responseFormat: 'content_and_artifact'
		}),
		tool((input) => session.open(input), {
			name: DataXLiveArtifactToolName.OPEN,
			description:
				'Open an existing Live Analytics Artifact version in the Data X Workbench without copying HTML or query data into the tool response.',
			schema: OpenLiveArtifactSchema,
			verboseParsingErrors: true,
			responseFormat: 'content_and_artifact'
		})
	]
}
