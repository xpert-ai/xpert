import '@angular/compiler'
import { Component, Pipe, inject, signal, provideZonelessChangeDetection, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog'
import { A11yModule } from '@angular/cdk/a11y'
import { DragDropModule } from '@angular/cdk/drag-drop'
import * as ui from '../../.cache/dialog-preview/ngc/tools/dialog-preview/ui.js'
import templates from '../../.cache/dialog-preview/scenes.json'
import locales from '../../.cache/dialog-preview/locales.json'
import { fixtureFor } from './fixtures.mjs'

const language = signal('zh')
const busy = signal(false)
const note = signal('')
const names = {
  setup: '初始化向导',
  registry: '插件注册',
  members: '项目成员',
  upload: '技能上传',
  confirm: '删除确认'
}
const widths = {
  setup: undefined,
  registry: 'min(1120px, calc(100vw - 2rem))',
  members: 'min(760px, calc(100vw - 2rem))',
  upload: undefined,
  confirm: '480px'
}
const notify = (text) => note.set(text)
class PreviewTranslatePipe {
  transform(key, params = {}) {
    let value = locales[language()]
    for (const part of key.split('.')) value = value?.[part]
    const text = typeof value === 'string' ? value : params.Default || key
    return text.replace(/{{\s*(\w+)\s*}}/g, (_, name) => String(params[name] ?? ''))
  }
}
Pipe({ name: 'translate', standalone: true, pure: false })(PreviewTranslatePipe)
class PreviewI18nPipe {
  transform(value) {
    return typeof value === 'string' ? value : value?.zh_Hans || value?.en_US || ''
  }
}
Pipe({ name: 'i18n', standalone: true })(PreviewI18nPipe)
const imports = [
  CommonModule,
  FormsModule,
  A11yModule,
  DragDropModule,
  PreviewTranslatePipe,
  PreviewI18nPipe,
  ui.XpDialogActionGroupDirective,
  ...ui.XpDialogFrameImports,
  ui.ZardButtonComponent,
  ui.ZardIconComponent,
  ui.ZardBadgeComponent,
  ui.ZardInputDirective,
  ...ui.ZardSelectImports,
  ...ui.ZardFormImports,
  ui.ZardCheckboxComponent,
  ui.ZardSwitchComponent
]
const sceneTypes = Object.fromEntries(
  Object.keys(names).map((key) => {
    class Scene {
      dialogRef = inject(DialogRef)
      close = () => this.dialogRef.close()
      constructor() {
        Object.assign(this, fixtureFor(key, busy, notify))
      }
    }
    const comp = Component({
      standalone: true,
      selector: `preview-${key}`,
      imports,
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      host: { class: 'block min-w-0' },
      template: templates[key]
    })(Scene)
    return [key, comp]
  })
)
class PreviewApp {
  dialog = inject(Dialog)
  scenes = Object.entries(names)
  dark = signal(false)
  language = language
  busy = busy
  note = note
  toggleTheme() {
    this.dark.update((value) => !value)
    document.documentElement.dataset.theme = this.dark() ? 'dark' : 'light'
  }
  open(key) {
    note.set('')
    this.dialog.open(sceneTypes[key], {
      width: widths[key],
      maxWidth: 'calc(100vw - 2rem)',
      panelClass: 'xp-overlay-pane-dialog',
      backdropClass: 'backdrop-blur-xs-black',
      ariaLabel: names[key]
    })
  }
}
Component({
  selector: 'dialog-preview',
  standalone: true,
  imports: [CommonModule, DialogModule],
  template: `
  <main class="preview-shell">
    <div class="preview-top">
      <div><p class="preview-muted" style="letter-spacing:2px">XPERT / DIALOG</p>
        <h1 style="font-size:30px;font-weight:600;margin:8px 0">5 个 Dialog 视觉试点</h1></div>
      <div class="preview-controls">
        <button (click)="toggleTheme()">{{ dark() ? '浅色' : '深色' }}</button>
        <button (click)="language.set(language() === 'zh' ? 'en' : 'zh')">{{ language() === 'zh' ? 'English' : '中文' }}</button>
        <button (click)="busy.set(!busy())">{{ busy() ? '恢复正常状态' : '查看处理中状态' }}</button>
      </div>
    </div>
    <p class="preview-note">真实模板与共享 UI 组件 · 示例数据。共享布局 · 14px 正文 · 表单与普通操作 36px · 关键流程 40px · 同组等高。<br>点击打开场景，按 Escape 或点击遮罩返回。预览不会调用业务 API。</p>
    <div class="preview-grid">
      @for (scene of scenes; track scene[0]; let i = $index) {
        <button class="preview-card" (click)="open(scene[0])">
          <div class="preview-muted" style="font-size:12px;margin-bottom:22px">0{{ i + 1 }}</div>
          <div style="font-size:18px;font-weight:600">{{ scene[1] }} <span style="float:right">↗</span></div>
        </button>
      }
    </div>
    <p class="preview-note">在独立 worktree 中实现；可先检查视觉效果，再决定是否扩展到其他 Dialog。</p>
    @if (note()) { <p role="status" class="preview-note">{{ note() }}</p> }
  </main>
`
})(PreviewApp)
bootstrapApplication(PreviewApp, { providers: [provideZonelessChangeDetection(), ui.provideZard()] }).catch(
  console.error
)
