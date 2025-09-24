import { Routes } from '@angular/router'
import { XpertStudioComponent } from '../../studio/studio.component'
import { XpertService } from '../../xpert/xpert.service'
import { KnowledgeConfigurationComponent } from './configuration/configuration.component'
import { KnowledgeDocumentChunkComponent } from './documents/chunk/chunk.component'
import { KnowledgeDocumentCreateComponent } from './documents/create/create.component'
import { KnowledgeDocumentsComponent } from './documents/documents.component'
import { KnowledgebaseComponent } from './knowledgebase.component'
import { KnowledgePipelinesComponent } from './pipelines/pipelines.component'
import { KnowledgeTestComponent } from './test/test.component'

export default [
  {
    path: '',
    component: KnowledgebaseComponent,
    data: {
      title: 'Settings / Knowledgebase'
    },
    children: [
      {
        path: '',
        redirectTo: 'documents',
        pathMatch: 'full'
      },
      {
        path: 'documents',
        component: KnowledgeDocumentsComponent,
        children: [
          {
            path: 'create',
            component: KnowledgeDocumentCreateComponent
          },
          {
            path: ':id',
            component: KnowledgeDocumentChunkComponent
          }
        ]
      },
      {
        path: 'configuration',
        component: KnowledgeConfigurationComponent
      },
      {
        path: 'test',
        component: KnowledgeTestComponent
      },
      {
        path: 'xpert/:id',
        component: XpertStudioComponent,
        providers: [XpertService]
      },
      {
        path: 'xpert',
        component: KnowledgePipelinesComponent
      }
    ]
  }
] as Routes
