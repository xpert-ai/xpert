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
        loadComponent: () => import('./overview/overview.component').then((m) => m.AgentEvolutionOverviewComponent),
        data: { subtitle: '持续发现、验证并安全发布智能体能力改进' }
      },
      {
        path: 'learning',
        loadComponent: () => import('./learning/learning.component').then((m) => m.AgentEvolutionLearningComponent),
        data: { subtitle: '从真实执行中发现可验证的改进机会' }
      },
      {
        path: 'evaluation',
        loadComponent: () =>
          import('./evaluation/evaluation.component').then((m) => m.AgentEvolutionEvaluationComponent),
        data: { subtitle: '在隔离环境中验证候选能力，阻止回归进入生产' }
      },
      {
        path: 'release',
        loadComponent: () => import('./release/release.component').then((m) => m.AgentEvolutionReleaseComponent),
        data: { subtitle: '以可审计的灰度策略发布能力版本' }
      }
    ]
  }
]
