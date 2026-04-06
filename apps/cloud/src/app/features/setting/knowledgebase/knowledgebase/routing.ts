import { Routes } from '@angular/router'
import { KnowledgeDocumentsComponent } from './documents/documents.component'
import { KnowledgebaseComponent } from './knowledgebase.component'
import { KnowledgeConfigurationComponent } from './configuration/configuration.component'
import { KnowledgeTestComponent } from './test/test.component'
import { KnowledgeDocumentChunkComponent } from './documents/chunk/chunk.component'
import { ExtensionHostViewPageComponent } from 'apps/cloud/src/app/@shared/view-extension'

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
            path: ':id',
            component: KnowledgeDocumentChunkComponent,
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
        path: 'view/:viewKey',
        component: ExtensionHostViewPageComponent,
        data: {
          hostType: 'knowledgebase',
          slot: 'detail.main_tabs'
        }
      }
    ]
  }
] as Routes
