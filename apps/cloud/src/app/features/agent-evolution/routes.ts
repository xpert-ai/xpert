import { Router, Routes } from '@angular/router'
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
        path: 'evaluation/approval/:changeId',
        loadComponent: () => import('./approval/approval.component').then((m) => m.EvolutionApprovalComponent)
      },
      {
        path: 'evaluation',
        loadComponent: () =>
          import('./evaluation/evaluation.component').then((m) => m.AgentEvolutionEvaluationComponent)
      },
      {
        path: 'release',
        loadComponent: () => import('./release/release-page.component').then((m) => m.EvolutionReleasePageComponent)
      },
      {
        path: 'targets',
        loadComponent: () => import('./targets/targets.component').then((m) => m.AgentEvolutionTargetsComponent)
      },
      {
        path: 'targets/:resourceId',
        loadComponent: () => import('./detail/target-detail.component').then((m) => m.EvolutionTargetDetailComponent)
      },
      {
        path: 'candidates/:resourceId',
        loadComponent: () =>
          import('./detail/agent-evolution-detail.component').then((m) => m.AgentEvolutionDetailComponent),
        data: { kind: 'candidate' }
      },
      {
        path: 'evaluations/:resourceId',
        loadComponent: () => import('./evaluation/historical-run.component').then((m) => m.HistoricalRunComponent)
      },
      {
        path: 'deployments/:resourceId',
        loadComponent: () => import('./release/deployment-history.component').then((m) => m.DeploymentHistoryComponent)
      }
    ]
  }
]
