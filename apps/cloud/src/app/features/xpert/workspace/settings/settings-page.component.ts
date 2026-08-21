import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { catchError, forkJoin, map, Observable, of, startWith, switchMap, take } from 'rxjs'
import {
  EnvironmentService,
  KnowledgebaseService,
  SkillPackageService,
  XpertAPIService,
  XpertToolsetCategoryEnum,
  XpertToolsetService,
  XpertTypeEnum
} from '../../../../@core'
import { XpertWorkspaceHomeComponent } from '../home/home.component'

type WorkspaceOverviewCounts = {
  assistants: number | null
  skills: number | null
  environments: number | null
  mcpTools: number | null
  knowledgebases: number | null
}

type WorkspaceOverviewState = {
  loading: boolean
  counts: WorkspaceOverviewCounts
}

const EMPTY_COUNTS: WorkspaceOverviewCounts = {
  assistants: null,
  skills: null,
  environments: null,
  mcpTools: null,
  knowledgebases: null
}

function countItems<T>(source: Observable<{ items: T[] }>): Observable<number | null> {
  return source.pipe(
    take(1),
    map(({ items }) => items.length),
    catchError(() => of(null))
  )
}

@Component({
  standalone: true,
  selector: 'xp-xpert-workspace-settings-page',
  imports: [CommonModule],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertWorkspaceSettingsPageComponent {
  readonly #xpertService = inject(XpertAPIService)
  readonly #skillPackageService = inject(SkillPackageService)
  readonly #environmentService = inject(EnvironmentService)
  readonly #toolsetService = inject(XpertToolsetService)
  readonly #knowledgebaseService = inject(KnowledgebaseService)

  readonly homeComponent = inject(XpertWorkspaceHomeComponent)
  readonly workspace = this.homeComponent.workspace
  readonly workspaceId = computed(() => this.workspace()?.id ?? null)

  readonly resourceModules = [
    {
      icon: 'ri-database-2-line',
      title: '数据源',
      description: '授权组织数据源'
    },
    {
      icon: 'ri-node-tree',
      title: '语义模型',
      description: '设计与发布模型'
    },
    {
      icon: 'ri-play-large-line',
      title: '查询分析',
      description: 'SQL / MDX 实验室'
    },
    {
      icon: 'ri-bar-chart-box-line',
      title: '指标管理',
      description: '治理业务指标'
    }
  ] as const

  readonly #overviewState = toSignal(
    toObservable(this.workspaceId).pipe(
      switchMap((workspaceId): Observable<WorkspaceOverviewState> => {
        if (!workspaceId) {
          return of({ loading: false, counts: EMPTY_COUNTS })
        }

        const queryLimit = 1000
        return forkJoin({
          assistants: countItems(
            this.#xpertService.getAllByWorkspace(workspaceId, {
              where: { type: XpertTypeEnum.Agent, latest: true },
              take: queryLimit
            })
          ),
          skills: countItems(this.#skillPackageService.getAllByWorkspace(workspaceId, { take: queryLimit })),
          environments: countItems(
            this.#environmentService.getAllInOrg({
              where: { workspaceId },
              take: queryLimit
            })
          ),
          mcpTools: countItems(
            this.#toolsetService.getAllByWorkspace(workspaceId, {
              where: { category: XpertToolsetCategoryEnum.MCP },
              take: queryLimit
            })
          ),
          knowledgebases: countItems(this.#knowledgebaseService.getAllByWorkspace(workspaceId, { take: queryLimit }))
        }).pipe(
          map((counts) => ({ loading: false, counts })),
          startWith({ loading: true, counts: EMPTY_COUNTS })
        )
      })
    ),
    { initialValue: { loading: true, counts: EMPTY_COUNTS } }
  )

  readonly overviewLoading = computed(() => this.#overviewState().loading)
  readonly metrics = computed(() => {
    const counts = this.#overviewState().counts
    return [
      { icon: 'ri-robot-2-line', label: '业务助理', value: counts.assistants },
      { icon: 'ri-box-3-line', label: '技能', value: counts.skills },
      { icon: 'ri-key-2-line', label: '环境变量', value: counts.environments },
      { icon: 'ri-tools-line', label: 'MCP工具', value: counts.mcpTools },
      { icon: 'ri-database-2-line', label: '知识库', value: counts.knowledgebases }
    ] as const
  })

  readonly workspaceStatus = computed(() => {
    switch (this.workspace()?.status) {
      case 'active':
        return '已启用'
      case 'deprecated':
        return '已停用'
      case 'archived':
        return '已归档'
      default:
        return '未知'
    }
  })
}
