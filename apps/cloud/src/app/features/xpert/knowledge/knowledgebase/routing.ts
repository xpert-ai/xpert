import { Routes } from '@angular/router'
import { KnowledgeConfigurationComponent } from './configuration/configuration.component'
import { KnowledgeDocumentChunkComponent } from './documents/chunk/chunk.component'
import { KnowledgeDocumentsComponent } from './documents/documents.component'
import { KnowledgebaseComponent } from './knowledgebase.component'
import { KnowledgeTestComponent } from './test/test.component'
import { KnowledgebasePipelinesComponent } from './pipelines/pipelines.component'
import { KnowledgeDocumentSettingsRouteComponent } from './documents/settings/settings-route.component'
import { KnowledgebasePipelineComponent } from './pipeline/pipeline.component'
import { ExtensionHostViewPageComponent } from 'apps/cloud/src/app/@shared/view-extension'
import { KnowledgeFAQComponent } from './faq/faq.component'
import { knowledgebaseWikiGuard } from './knowledgebase-wiki.guard'

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
            redirectTo: '',
            pathMatch: 'full'
          },
          {
            path: 'create-from-pipeline',
            redirectTo: '',
            pathMatch: 'full'
          },
          {
            path: ':id',
            component: KnowledgeDocumentChunkComponent
          },
          {
            path: ':id/settings',
            component: KnowledgeDocumentSettingsRouteComponent
          }
        ]
      },
      {
        path: 'faq',
        component: KnowledgeFAQComponent
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
        path: 'graph',
        data: { preload: false },
        loadComponent: () => import('./graph/graph.component').then((m) => m.KnowledgeGraphComponent)
      },
      {
        path: 'wiki',
        data: { preload: false },
        canActivate: [knowledgebaseWikiGuard],
        loadComponent: () => import('./wiki/wiki.component').then((m) => m.KnowledgeWikiComponent)
      },
      {
        path: 'view/:viewKey',
        component: ExtensionHostViewPageComponent,
        data: {
          hostType: 'knowledgebase',
          slot: 'detail.main_tabs'
        }
      },
      {
        path: 'xpert/:id',
        component: KnowledgebasePipelineComponent
      },
      {
        path: 'xpert',
        component: KnowledgebasePipelinesComponent
      }
    ]
  }
] as Routes
