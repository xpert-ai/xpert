import '@angular/compiler'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  Component,
  Pipe,
  inject,
  signal,
  provideZonelessChangeDetection,
  importProvidersFrom,
  CUSTOM_ELEMENTS_SCHEMA
} from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { CommonModule } from '@angular/common'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog'
import { A11yModule } from '@angular/cdk/a11y'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { DragDropModule } from '@angular/cdk/drag-drop'
import * as ui from '../../.cache/dialog-preview/ngc/tools/dialog-preview/ui.js'
import templates from '../../.cache/dialog-preview/scenes.json'
import locales from '../../.cache/dialog-preview/locales.json'
import { fixtureFor } from './fixtures.mjs'
import { batchTwo } from './batch-02.mjs'
import { batchTwoFixture } from './batch-02-fixtures.mjs'
import { batchThree } from './batch-03.mjs'
import { batchFour } from './batch-04.mjs'
import { batchSix } from './batch-06.mjs'
import { batchSeven } from './batch-07.mjs'
import { batchEight } from './batch-08.mjs'
import { batchNine } from './batch-09.mjs'
import { batchNineFixture } from './batch-09-fixtures.mjs'
import { batchNineChildren } from './batch-09-children.mjs'
import { batchEightFixture } from './batch-08-fixtures.mjs'
import { batchEightChildren } from './batch-08-children.mjs'
import { batchSevenFixture } from './batch-07-fixtures.mjs'
import { batchSevenChildren } from './batch-07-children.mjs'
import { batchSixFixture } from './batch-06-fixtures.mjs'
import { batchSixChildren } from './batch-06-children.mjs'
import { batchFive } from './batch-05.mjs'
import { batchFiveFixture } from './batch-05-fixtures.mjs'
import { batchFiveChildren } from './batch-05-children.mjs'
import { batchFourFixture } from './batch-04-fixtures.mjs'
import { batchFourChildren } from './batch-04-children.mjs'
import { batchThreeFixture, reviewListFixture } from './batch-03-fixtures.mjs'

const language = signal('zh')
const busy = signal(false)
const note = signal('')
const planMode = signal('plan')
const actionMode = signal('approve')
const qrState = signal('waiting')
const editMode = signal('rename')
const names = {
  setup: '初始化向导',
  registry: '插件注册',
  members: '项目成员',
  upload: '技能上传',
  confirm: '删除确认',
  ...Object.fromEntries(
    Object.entries({
      ...batchTwo,
      ...batchThree,
      ...batchFour,
      ...batchFive,
      ...batchSix,
      ...batchSeven,
      ...batchEight,
      ...batchNine
    }).map(([key, scene]) => [key, scene.name])
  )
}
const widths = {
  setup: undefined,
  registry: 'min(1120px, calc(100vw - 2rem))',
  members: 'min(760px, calc(100vw - 2rem))',
  upload: undefined,
  confirm: '480px',
  ...Object.fromEntries(
    Object.entries({
      ...batchTwo,
      ...batchThree,
      ...batchFour,
      ...batchFive,
      ...batchSix,
      ...batchSeven,
      ...batchEight,
      ...batchNine
    }).map(([key, scene]) => [key, scene.width])
  )
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
class PreviewModelTypePipe {
  transform(value) {
    return value
  }
}
Pipe({ name: 'kebabToCamelCase', standalone: true })(PreviewModelTypePipe)
const imports = [
  CdkMenuModule,
  ui.ZardSegmentedComponent,
  ui.ZardSegmentedItemComponent,
  ...ui.ZardTooltipImports,
  CdkListboxModule,
  PreviewModelTypePipe,
  CommonModule,
  FormsModule,
  ReactiveFormsModule,
  ui.ZardTagSelectComponent,
  ui.ZardDatePickerComponent,
  ui.ZardComboboxComponent,
  ui.ZardComboboxOptionTemplateDirective,
  ...ui.ZardTableImports,
  ui.QRCodeComponent,
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
  ui.ZardSwitchComponent,
  ui.ZardRadioGroupComponent,
  ui.ZardRadioComponent,
  ...ui.ZardStepperImports,
  ui.ZardToggleGroupComponent,
  ui.ZardToggleGroupItemComponent,
  ui.FilesUploadComponent,
  ui.XpTableComponent,
  ui.XpDialogControlDirective,
  ui.ZardSearchInputComponent,
  ui.XpSelectComponent,
  ui.XpDndDirective
]
class PreviewReviewList {
  constructor() {
    Object.assign(this, reviewListFixture(busy, notify))
  }
}
Component({
  standalone: true,
  selector: 'xp-xpert-access-request-review-list',
  imports,
  template: templates.reviewList
})(PreviewReviewList)
const fourthChildren = batchFourChildren(imports, templates)
const fifthChildren = batchFiveChildren(imports, templates)
const sixthChildren = batchSixChildren(imports, templates, busy, notify)
const seventhChildren = batchSevenChildren([...imports, ...sixthChildren], templates, busy, notify)
const eighthChildren = batchEightChildren([...imports, ...sixthChildren, ...seventhChildren], templates, busy, notify)
const ninthChildren = batchNineChildren([...imports, ...sixthChildren, ...seventhChildren], templates, busy, notify)
const sceneTypes = Object.fromEntries(
  Object.keys(names).map((key) => {
    class Scene {
      dialogRef = inject(DialogRef)
      close = () => this.dialogRef.close()
      dialog = this.dialogRef
      ref = this.dialogRef
      constructor() {
        Object.assign(
          this,
          batchNine[key]
            ? batchNineFixture(key, busy, notify, this.close)
            : batchEight[key]
              ? batchEightFixture(key, busy, notify, this.close)
              : batchSeven[key]
                ? batchSevenFixture(key, busy, notify, this.close)
                : batchSix[key]
                  ? batchSixFixture(key, busy, notify, this.close)
                  : batchFive[key]
                    ? batchFiveFixture(key, busy, notify, this.close, editMode, qrState)
                    : batchFour[key]
                      ? batchFourFixture(key, busy, notify, this.close)
                      : batchThree[key]
                        ? batchThreeFixture(key, busy, notify, actionMode, qrState)
                        : batchTwo[key]
                          ? batchTwoFixture(key, busy, notify, planMode)
                          : fixtureFor(key, busy, notify)
        )
        if (key === 'assistantSettings')
          Object.defineProperty(this, 'title', {
            get: () => this.sections.find((item) => item.key === this.activeSection()).title
          })
        if (key === 'toolAuth')
          Object.defineProperty(this, 'authType', { get: () => this.formGroup.value.auth_type?.[0] })
      }
    }
    const comp = Component({
      standalone: true,
      selector: `preview-${key}`,
      imports: [
        ...imports,
        PreviewReviewList,
        ...fourthChildren,
        ...fifthChildren,
        ...sixthChildren,
        ...seventhChildren,
        ...eighthChildren,
        ...ninthChildren
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      host: { class: 'block min-w-0' },
      template: templates[key]
    })(Scene)
    return [key, comp]
  })
)
class PreviewApp {
  dialog = inject(Dialog)
  batch = signal('ninth')
  editMode = editMode
  actionMode = actionMode
  qrState = qrState
  planMode = planMode
  get scenes() {
    return Object.entries(names).filter(([key]) =>
      this.batch() === 'ninth'
        ? !!batchNine[key]
        : this.batch() === 'eighth'
          ? !!batchEight[key] && !batchNine[key]
          : this.batch() === 'seventh'
            ? !!batchSeven[key] && !batchEight[key] && !batchNine[key]
            : this.batch() === 'sixth'
              ? !!batchSix[key]
              : this.batch() === 'fifth'
                ? !!batchFive[key]
                : this.batch() === 'fourth'
                  ? !!batchFour[key]
                  : this.batch() === 'third'
                    ? !!batchThree[key]
                    : this.batch() === 'second'
                      ? !!batchTwo[key]
                      : !batchTwo[key] &&
                        !batchThree[key] &&
                        !batchFour[key] &&
                        !batchFive[key] &&
                        !batchSix[key] &&
                        !batchSeven[key] &&
                        !batchEight[key] &&
                        !batchNine[key]
    )
  }
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
      maxWidth:
        batchTwo[key] ||
        batchThree[key] ||
        batchFour[key] ||
        batchFive[key] ||
        batchSix[key] ||
        batchSeven[key] ||
        batchEight[key] ||
        batchNine[key]
          ? 'calc(100vw - 32px)'
          : 'calc(100vw - 2rem)',
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
        <h1 style="font-size:30px;font-weight:600;margin:8px 0">{{ batch() === 'ninth' ? '第九批 · 10 个 Dialog' : batch() === 'eighth' ? '第八批 · 10 个 Dialog' : batch() === 'seventh' ? '第七批 · 10 个 Dialog' : batch() === 'sixth' ? '第六批 · 10 个 Dialog' : batch() === 'fifth' ? '第五批 · 10 个 Dialog' : batch() === 'fourth' ? '第四批 · 10 个 Dialog' : batch() === 'third' ? '第三批 · 10 个 Dialog' : batch() === 'second' ? '第二批 · 10 个 Dialog' : '首批 · 5 个 Dialog' }}</h1></div>
      <div class="preview-controls">
        <select aria-label="预览批次" [value]="batch()" (change)="batch.set($event.target.value)"><option value="ninth">第九批</option><option value="eighth">第八批</option><option value="seventh">第七批</option><option value="sixth">第六批</option><option value="fifth">第五批</option><option value="fourth">第四批</option><option value="third">第三批</option><option value="second">第二批</option><option value="first">首批</option></select>
        <button (click)="toggleTheme()">{{ dark() ? '浅色' : '深色' }}</button>
        <button (click)="language.set(language() === 'zh' ? 'en' : 'zh')">{{ language() === 'zh' ? 'English' : '中文' }}</button>
        <button (click)="busy.set(!busy())">{{ busy() ? '恢复正常状态' : '查看处理中状态' }}</button>
      </div>
    </div>
    <p class="preview-note">真实模板与共享 UI 组件 · 示例数据。共享布局 · 14px 正文 · 表单与普通操作 36px · 关键流程 40px · 同组等高。<br>点击打开场景，按 Escape 或点击遮罩返回。预览不会调用业务 API。</p>
    @if (batch() === 'ninth') { <p class="preview-note">本批使用生产窗口、MCP 配置、助手设置子模板；业务接口、模型/目录选择和处理设置使用本地示例适配。业务与权限结果请在平台验收。</p> }
    @if (batch() === 'eighth') { <p class="preview-note">生产窗口及授权、资源导入、文件列表、流水线步骤模板；本地示例数据。Markdown、插件卡片、工具列表、调度字段和 API 选择器为预览适配，业务与权限请在平台验收。</p> }
    @if (batch() === 'seventh') { <p class="preview-note">本批使用生产 Dialog、工作空间设置、成员、API Key、工具配置和集成表单模板。头像、用户信息、标签、模型/集成选择、文件和技能列表使用本地适配示例；真实接口与权限请在平台验收。</p> }
    @if (batch() === 'sixth') { <p class="preview-note">本批使用生产 Dialog、工具测试面板与授权入口模板；变量选择、参数表单和插件 JSON Schema 表单使用本地适配示例。授权与保存结果请在平台验收。</p> }
    @if (batch() === 'fifth') { <p class="preview-note">本批使用生产 Dialog 与凭据字段模板；会话列表、模型选择和提示词编辑器使用本地适配示例，业务流程请在平台验收。<br>会话操作：<select aria-label="会话操作" [value]="editMode()" (change)="editMode.set($event.target.value)"><option value="rename">重命名</option><option value="delete">删除</option></select> · 扫码状态：<select aria-label="扫码状态" [value]="qrState()" (change)="qrState.set($event.target.value)"><option value="waiting">等待扫码</option><option value="expired">已过期</option><option value="failed">失败</option></select></p> }
    @if (batch() === 'fourth') { <p class="preview-note">本批使用生产 Dialog 模板；创建用户、邀请用户和创建专家的内嵌表单为本地适配示例，真实数据与校验请在平台验收。</p> }
    @if (batch() === 'second') { <p class="preview-note">计划类型：<select aria-label="计划类型" [value]="planMode()" (change)="planMode.set($event.target.value)"><option value="plan">计划</option><option value="sprint">迭代</option><option value="milestone">里程碑</option></select></p> }
    @if (batch() === 'third') {
    <p class="preview-note">模型审批：<select aria-label="模型审批模式" [value]="actionMode()" (change)="actionMode.set($event.target.value)"><option value="approve">批准</option><option value="reject">拒绝</option><option value="extend">延期</option><option value="revoke">撤销</option></select>
    · 扫码状态：<select aria-label="扫码状态" [value]="qrState()" (change)="qrState.set($event.target.value)"><option value="waiting">等待扫码</option><option value="expired">已过期</option><option value="failed">失败</option></select></p> }
    <div class="preview-grid">
      @for (scene of scenes; track scene[0]; let i = $index) {
        <button class="preview-card" (click)="open(scene[0])">
          <div class="preview-muted" style="font-size:12px;margin-bottom:22px">{{ (i + 1).toString().padStart(2, '0') }}</div>
          <div style="font-size:18px;font-weight:600">{{ scene[1] }} <span style="float:right">↗</span></div>
        </button>
      }
    </div>
    <p class="preview-note">在独立 worktree 中实现；可先检查视觉效果，再决定是否扩展到其他 Dialog。</p>
    @if (note()) { <p role="status" class="preview-note">{{ note() }}</p> }
  </main>
`
})(PreviewApp)
bootstrapApplication(PreviewApp, {
  providers: [provideZonelessChangeDetection(), ui.provideZard(), importProvidersFrom(TranslateModule.forRoot())]
})
  .then((app) => {
    const translate = app.injector.get(TranslateService)
    translate.setTranslation('zh', locales.zh)
    translate.use('zh')
  })
  .catch(console.error)
