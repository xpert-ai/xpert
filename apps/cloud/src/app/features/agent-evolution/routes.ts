import { Routes } from '@angular/router'
import { AgentEvolutionComponent } from './agent-evolution.component'

export const routes: Routes = [
  {
    path: '',
    component: AgentEvolutionComponent,
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      {
        path: 'overview',
        loadComponent: () => import('./overview/overview.component').then((m) => m.AgentEvolutionOverviewComponent)
      },
      {
        path: 'learning',
        loadComponent: () => import('./learning/learning.component').then((m) => m.AgentEvolutionLearningComponent)
      },
      {
        path: 'evaluation',
        loadComponent: () =>
          import('./evaluation/evaluation.component').then((m) => m.AgentEvolutionEvaluationComponent)
      },
      {
        path: 'release',
        loadComponent: () => import('./release/release.component').then((m) => m.AgentEvolutionReleaseComponent)
      },
      {
        path: 'targets/:resourceId',
        loadComponent: () =>
          import('./detail/agent-evolution-detail.component').then((m) => m.AgentEvolutionDetailComponent),
        data: { kind: 'target' }
      },
      {
        path: 'candidates/:resourceId',
        loadComponent: () =>
          import('./detail/agent-evolution-detail.component').then((m) => m.AgentEvolutionDetailComponent),
        data: { kind: 'candidate' }
      },
      {
        path: 'evaluations/:resourceId',
        loadComponent: () =>
          import('./detail/agent-evolution-detail.component').then((m) => m.AgentEvolutionDetailComponent),
        data: { kind: 'evaluation' }
      },
      {
        path: 'deployments/:resourceId',
        loadComponent: () =>
          import('./detail/agent-evolution-detail.component').then((m) => m.AgentEvolutionDetailComponent),
        data: { kind: 'deployment' }
      }
    ]
  }
]
