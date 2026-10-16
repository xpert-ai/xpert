import '@angular/compiler'
import { Component, importProvidersFrom, provideZonelessChangeDetection } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { provideRouter } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { XpertAuthorizationComponent } from '../../.cache/sharing-preview/src/authorization.component'
import { XpertComponent, notice } from './fixtures'
import { ZardButtonComponent, provideZard } from './ui'
import zh from '../../apps/cloud/src/assets/i18n/zh-Hans.json'
@Component({
  selector: 'sharing-preview',
  standalone: true,
  imports: [XpertAuthorizationComponent, ZardButtonComponent],
  providers: [XpertComponent],
  template: ` <div class="flex h-screen min-h-0 bg-background font-sans text-foreground">
      <aside class="hidden w-56 shrink-0 border-r border-border bg-muted/30 p-4 lg:flex lg:flex-col">
        <div class="mb-8 text-sm">
          <div class="text-xs text-muted-foreground">当前组织</div>
          <strong>南京元数信息技术</strong>
        </div>
        <div class="space-y-5 text-sm">
          <p><i class="ri-add-box-line mr-3"></i>新建任务</p>
          <p><i class="ri-group-line mr-3"></i>专家·技能·连接器</p>
          <p><i class="ri-timer-line mr-3"></i>自动化</p>
          <p><i class="ri-apps-line mr-3"></i>更多</p>
          <p><i class="ri-history-line mr-3"></i>最近任务</p>
        </div>
        <p class="mb-4 mt-9 text-xs text-muted-foreground">助手</p>
        <div class="space-y-5 text-sm">
          <p>统一体悟语义执行专家</p>
          <p>GLM–5.1 Multi-Agent</p>
          <p>GLM–5.1</p>
        </div>
        <p class="mb-4 mt-9 text-xs text-muted-foreground">功能</p>
        <div class="space-y-5 text-sm">
          <p><i class="ri-database-2-line mr-3"></i>数据与本体</p>
          <p><i class="ri-folder-line mr-3"></i>项目</p>
          <p class="rounded-md bg-muted p-2"><i class="ri-layout-grid-line mr-3"></i>工作空间</p>
        </div>
        <div class="mt-auto text-sm"><i class="ri-settings-3-line mr-3"></i>设置</div>
      </aside>
      <aside class="hidden w-56 shrink-0 border-r border-border p-3 md:block">
        <div class="mb-6 rounded-lg border border-border p-2 text-sm">
          <i class="ri-robot-2-line mr-2"></i>工作空间 / ClawXpert
        </div>
        <strong class="text-base">ClawXpert</strong>
        <p class="mb-5 mt-1 text-xs text-muted-foreground">AGENT · v1</p>
        <nav class="space-y-2 border-t border-border pt-4 text-sm">
          <p class="p-2"><i class="ri-group-line mr-2"></i>智能体</p>
          <p class="rounded-lg bg-muted p-2 font-medium"><i class="ri-user-add-line mr-2"></i>分享与访问</p>
          <p class="p-2"><i class="ri-brain-line mr-2"></i>记忆</p>
          <p class="p-2"><i class="ri-file-list-line mr-2"></i>日志</p>
          <p class="p-2"><i class="ri-pulse-line mr-2"></i>监测</p>
        </nav>
      </aside>
      <xpert-authorization />
    </div>
    <div
      class="fixed bottom-3 left-3 z-50 flex flex-wrap gap-2 rounded-xl border border-border bg-background p-2 shadow-sm text-xs"
      aria-label="预览控件"
    >
      <a z-button zType="outline" zSize="sm" href="?mode=personal">无用户组权限</a
      ><a z-button zType="outline" zSize="sm" href="?mode=groups">有用户组权限</a
      ><a z-button zType="outline" zSize="sm" href="?mode=readonly">只读</a
      ><button z-button zType="outline" zSize="sm" (click)="toggleTheme()">深浅色</button>
      @if (notice()) {
        <span role="status" class="p-2">{{ notice() }}</span>
      }
    </div>`
})
class Preview {
  notice = notice
  toggleTheme() {
    document.documentElement.classList.toggle('dark')
  }
}
bootstrapApplication(Preview, {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter([]),
    importProvidersFrom(TranslateModule.forRoot()),
    provideZard()
  ]
}).then((app) => {
  const translate = app.injector.get(TranslateService)
  translate.setTranslation('zh-Hans', zh)
  translate.use('zh-Hans')
})
