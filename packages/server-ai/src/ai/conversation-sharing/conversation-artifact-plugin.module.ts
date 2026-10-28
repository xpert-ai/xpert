import { Module } from '@nestjs/common'
import { CONVERSATION_SHARE_ARTIFACT_SOURCE, type ConversationShareSnapshot } from '@xpert-ai/contracts'
import { ArtifactTypeRegistry } from '@xpert-ai/plugin-sdk'
import { ArtifactTypesModule } from '../../artifacts/types/artifact-types.module'
import { ArtifactTypeViews } from '../../artifacts/types/artifact-type-views'
import { ConversationArtifactPlugin, conversationSnapshotUrl } from './conversation-artifact.plugin'
import { snapshotSchema } from './conversation-snapshot.schema'

/** Register the built-in type and host view without coupling Artifact core to conversations. */
@Module({
    imports: [ArtifactTypesModule],
    providers: [ConversationArtifactPlugin],
    exports: [ConversationArtifactPlugin]
})
export class ConversationArtifactPluginModule {
    constructor(registry: ArtifactTypeRegistry, views: ArtifactTypeViews, conversations: ConversationArtifactPlugin) {
        registry.registerBuiltin(CONVERSATION_SHARE_ARTIFACT_SOURCE, conversations)
        views.register(CONVERSATION_SHARE_ARTIFACT_SOURCE, conversationSnapshotUrl, (data) => ({
            kind: 'conversation',
            snapshot: snapshotSchema.parse(data) as ConversationShareSnapshot
        }))
    }
}
