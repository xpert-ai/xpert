import { ContentResourceOperation } from './catalog/content-operation.entity'
import { ContentOperations } from './catalog/content-operations.service'
import { ContentCatalogMaintenance } from './catalog/content-catalog-maintenance.service'
import { ContentIdentityService } from './content-identity.service'
import { ContentDocumentReferences } from './documents/document-references.service'
import { ContentDocumentMaintenance } from './documents/document-maintenance.service'
import { ContentDocumentHierarchy } from './documents/document-hierarchy.service'
import { ContentDocumentLocations } from './documents/document-location.service'
import { ContentEditorsService } from './content-editors.service'
import { Global, Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ContentResourceProviderRegistry, ContentEditorRegistry } from '@xpert-ai/plugin-sdk'
import { UserOrganization, UserGroup, User } from '@xpert-ai/server-core'
import { RuntimeCapabilityModule } from '../shared/runtime/runtime-capability.module'
import { ContentResourceService } from './content-resource.service'
import { XpertProjectAccessModule } from '../xpert-project/project-access.module'
import { CollaborationModule } from '../collaboration/collaboration.module'
import { contentDocumentEntities } from './documents/entities'
import { ContentDocumentAccess } from './documents/document-access.service'
import { ContentDocumentStore } from './documents/document-store.service'
import { ContentDocumentService } from './documents/document.service'
import { ContentDocumentLifecycle } from './documents/document-lifecycle.service'
import { ContentDocumentComments } from './documents/document-comments.service'
import { ContentDocumentReview } from './documents/document-review.service'
import { ContentDocumentsRuntimeService } from './documents/document-runtime.service'
import { ContentDocumentCollaborationProvider } from './documents/document-collaboration.provider'
import { ContentDocumentResourceProvider } from './documents/document-resource.provider'
import { ContentEditorPreferences } from './catalog/editor-preferences.service'
import { ContentEditorPreference } from './catalog/editor-preference.entity'
import { ContentCatalogService } from './catalog/content-catalog.service'
import { ContentResourceEntry } from './catalog/content-entry.entity'

@Global()
@Module({
    imports: [
        DiscoveryModule,
        RuntimeCapabilityModule,
        XpertProjectAccessModule,
        CollaborationModule,
        TypeOrmModule.forFeature([
            ContentEditorPreference,
            ContentResourceEntry,
            ContentResourceOperation,
            User,
            UserOrganization,
            UserGroup,
            ...contentDocumentEntities
        ])
    ],
    providers: [
        ContentOperations,
        ContentCatalogMaintenance,
        ContentEditorPreferences,
        ContentCatalogService,
        ContentDocumentReferences,
        ContentDocumentHierarchy,
        ContentDocumentLocations,
        ContentDocumentMaintenance,
        ContentEditorsService,
        ContentResourceProviderRegistry,
        ContentIdentityService,
        ContentResourceService,
        ContentEditorRegistry,
        ContentDocumentAccess,
        ContentDocumentStore,
        ContentDocumentService,
        ContentDocumentReview,
        ContentDocumentLifecycle,
        ContentDocumentComments,
        ContentDocumentsRuntimeService,
        ContentDocumentCollaborationProvider,
        ContentDocumentResourceProvider
    ],
    exports: [
        ContentResourceProviderRegistry,
        ContentIdentityService,
        ContentResourceService,
        ContentEditorsService,
        ContentEditorRegistry,
        ContentDocumentService,
        ContentDocumentsRuntimeService
    ]
})
export class ContentResourceModule {}
