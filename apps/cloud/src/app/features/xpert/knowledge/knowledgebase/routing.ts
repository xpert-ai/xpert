import { Routes } from '@angular/router'
import { KnowledgeConfigurationComponent } from './configuration/configuration.component'
import { KnowledgeDocumentChunkComponent } from './documents/chunk/chunk.component'
import { KnowledgeDocumentCreateComponent } from './documents/create/create.component'
import { KnowledgeDocumentsComponent } from './documents/documents.component'
import { KnowledgebaseComponent } from './knowledgebase.component'
import { KnowledgeTestComponent } from './test/test.component'
import { KnowledgeDocumentPipelineComponent } from './documents/pipeline/pipeline.component'
import { KnowledgebasePipelinesComponent } from './pipelines/pipelines.component'
import { KnowledgeDocumentSettingsComponent } from './documents/settings/settings.component'
import { KnowledgebasePipelineComponent } from './pipeline/pipeline.component'

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
            path: 'create-from-pipeline',
            component: KnowledgeDocumentPipelineComponent
          },
          {
            path: ':id',
            component: KnowledgeDocumentChunkComponent
          },
          {
            path: ':id/settings',
            component: KnowledgeDocumentSettingsComponent
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
        component: KnowledgebasePipelineComponent,
      },
      {
        path: 'xpert',
        component: KnowledgebasePipelinesComponent
      }
    ]
  }
] as Routes
