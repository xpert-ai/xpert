import { CommonModule } from '@angular/common'
import { Component, OnInit, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'
import { AIPermissionsEnum } from '@cloud/app/@core'
import {
  ZardAlertDialogService,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardIconComponent,
  ZardTabsImports
} from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { filter, map, startWith } from 'rxjs/operators'
import { AgentEvolutionFacade } from './agent-evolution.facade'

@Component({
  standalone: true,
  selector: 'xp-agent-evolution',
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardTabsImports
  ],
  providers: [AgentEvolutionFacade],
  templateUrl: './agent-evolution.component.html',
  host: {
    class: 'block h-full w-full min-w-0 flex-1'
  }
})
export class AgentEvolutionComponent implements OnInit {
  readonly facade = inject(AgentEvolutionFacade)
  readonly #alertDialog = inject(ZardAlertDialogService)
  readonly #translate = inject(TranslateService)
  readonly #router = inject(Router)

  readonly AIPermissionsEnum = AIPermissionsEnum
  readonly currentUrl = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.#router.url)
    ),
    { initialValue: this.#router.url }
  )
  readonly activeSubtitle = computed(() => {
    const url = this.currentUrl()
    if (url.includes('/learning')) {
      return '从真实执行中发现可验证的改进机会'
    }
    if (url.includes('/evaluation')) {
      return '在隔离环境中验证候选能力，阻止回归进入生产'
    }
    if (url.includes('/release')) {
      return '以可审计的灰度策略发布能力版本'
    }
    return '持续发现、验证并安全发布智能体能力改进'
  })

  readonly tabs = [
    { path: 'overview', label: '概览', icon: 'ri-dashboard-line' },
    { path: 'learning', label: '学习与建议', icon: 'ri-lightbulb-flash-line' },
    { path: 'evaluation', label: '候选与评测', icon: 'ri-flask-line' },
    { path: 'release', label: '发布与运行', icon: 'ri-rocket-line' }
  ]

  ngOnInit() {
    void this.facade.load()
  }

  async simulate() {
    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        title: this.#translate.instant('XP.AgentEvolution.SimulateTitle', {
          Default: '执行完整 Agent Evolution 示例？'
        }),
        description: this.#translate.instant('XP.AgentEvolution.SimulateDescription', {
          Default:
            '将执行“多语言发票金额字段映射”合成测试案例，并把学习事件、建议、候选、黄金集、评测、审批、Shadow、Canary 和指针切换全部写入当前租户数据表。'
        }),
        actionText: this.#translate.instant('XP.AgentEvolution.StartSimulation', { Default: '运行并验证数据' }),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: '取消' })
      })
    )
    if (confirmed) {
      await this.facade.runSimulation()
    }
  }
}
