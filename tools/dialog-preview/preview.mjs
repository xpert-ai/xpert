import '@angular/compiler'
import { remainingDialogs } from './remaining.mjs'
import { remainingFixture, wizardMode } from './remaining-fixtures.mjs'
import { remainingChildren } from './remaining-children.mjs'
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
import { batchTen } from './batch-10.mjs'
import { batchTwelve } from './batch-12.mjs'
import { batchThirteen } from './batch-13.mjs'
import { batchFourteen, batchFourteenOptions } from './batch-14.mjs'
import { batchFifteen, batchFifteenOptions, bulkMembershipAction } from './batch-15.mjs'
import { batchThirteenFixture, roleNameMode, approvalPath } from './batch-13-fixtures.mjs'
import { batchTwelveFixture } from './batch-12-fixtures.mjs'
import { batchTwelveChildren } from './batch-12-children.mjs'
import { RouterModule, provideRouter } from '@angular/router'
import { batchEleven } from './batch-11.mjs'
import { batchElevenFixture, connectorPreviewMode } from './batch-11-fixtures.mjs'
import { batchElevenChildren } from './batch-11-children.mjs'
import { PickerComponent } from '@ctrl/ngx-emoji-mart'
import { EmojiComponent } from '@ctrl/ngx-emoji-mart/ngx-emoji'
import { batchTenFixture, workflowPanelMode } from './batch-10-fixtures.mjs'
import { batchTenChildren } from './batch-10-children.mjs'
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
const dark = signal(false)
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
      ...batchNine,
      ...batchTen,
      ...batchEleven,
      ...batchTwelve,
      ...batchThirteen,
      ...batchFourteen,
      ...batchFifteen,
      ...remainingDialogs
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
      ...batchNine,
      ...batchTen,
      ...batchEleven,
      ...batchTwelve,
      ...batchThirteen,
      ...batchFourteen,
      ...batchFifteen,
      ...remainingDialogs
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
  RouterModule,
  CdkMenuModule,
  ui.ZardInputGroupComponent,
  ui.UiDialogCloseDirective,
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
const tenthChildren = batchTenChildren(imports, templates, busy, notify)
const eleventhChildren = batchElevenChildren(imports)
const twelfthChildren = batchTwelveChildren(imports, templates)
const remainingChildTypes = remainingChildren(imports, templates)
const templateSceneKeys = Object.keys(names).filter(
  (key) => !batchFourteen[key] && !batchFifteen[key] && !remainingDialogs[key]?.service
)
const sceneTypes = Object.fromEntries(
  templateSceneKeys.map((key) => {
    class Scene {
      dialogRef = inject(DialogRef)
      close = () => this.dialogRef.close()
      dialog = this.dialogRef
      ref = this.dialogRef
      constructor() {
        Object.assign(
          this,
          remainingDialogs[key]
            ? remainingFixture(key, busy, notify, this.close)
            : batchThirteen[key]
              ? batchThirteenFixture(key, (key, params) => new PreviewTranslatePipe().transform(key, params))
              : batchTwelve[key]
                ? batchTwelveFixture(key, busy, notify, this.close)
                : batchEleven[key]
                  ? batchElevenFixture(key, busy, notify, this.close, dark)
                  : batchTen[key]
                    ? batchTenFixture(key, busy, notify, this.close)
                    : batchNine[key]
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
      imports: remainingDialogs[key]
        ? [...imports, ...fourthChildren, ...sixthChildren, ...ninthChildren, ...remainingChildTypes]
        : batchTwelve[key]
          ? [...imports, ...sixthChildren, ...tenthChildren, ...twelfthChildren]
          : batchEleven[key]
            ? [...imports, ...sixthChildren, ...eleventhChildren, PickerComponent, EmojiComponent]
            : batchTen[key]
              ? [...imports, ...sixthChildren, ...tenthChildren]
              : [
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
      host: { class: batchTwelve[key]?.height ? 'block min-w-0 h-full' : 'block min-w-0' },
      template: templates[key]
    })(Scene)
    return [key, comp]
  })
)
class PreviewApp {
  dialog = inject(Dialog)
  alertDialog = inject(ui.ZardAlertDialogService)
  legacyDialog = inject(ui.ZardDialogService)
  wizardMode = wizardMode
  batch = signal('remaining')
  bulkMembershipAction = bulkMembershipAction
  roleNameMode = roleNameMode
  approvalPath = approvalPath
  connectorPreviewMode = connectorPreviewMode
  workflowPanelMode = workflowPanelMode
  editMode = editMode
  actionMode = actionMode
  qrState = qrState
  planMode = planMode
  get scenes() {
    return Object.entries(names).filter(([key]) =>
      this.batch() === 'remaining'
        ? !!remainingDialogs[key]
        : this.batch() === 'fifteenth'
          ? !!batchFifteen[key]
          : this.batch() === 'fourteenth'
            ? !!batchFourteen[key]
            : this.batch() === 'thirteenth'
              ? !!batchThirteen[key]
              : this.batch() === 'twelfth'
                ? !!batchTwelve[key]
                : this.batch() === 'eleventh'
                  ? !!batchEleven[key] && !batchTwelve[key]
                  : this.batch() === 'tenth'
                    ? !!batchTen[key]
                    : this.batch() === 'ninth'
                      ? !!batchNine[key] && !batchTen[key]
                      : this.batch() === 'eighth'
                        ? !!batchEight[key] && !batchNine[key] && !batchTen[key]
                        : this.batch() === 'seventh'
                          ? !!batchSeven[key] && !batchEight[key] && !batchNine[key] && !batchTen[key]
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
                                      !batchNine[key] &&
                                      !batchTen[key] &&
                                      !batchEleven[key] &&
                                      !batchTwelve[key] &&
                                      !batchThirteen[key] &&
                                      !batchFourteen[key] &&
                                      !batchFifteen[key]
    )
  }
  dark = dark
  language = language
  busy = busy
  note = note
  toggleTheme() {
    this.dark.update((value) => !value)
    document.documentElement.dataset.theme = this.dark() ? 'dark' : 'light'
  }
  open(key) {
    note.set('')
    if (remainingDialogs[key]?.service) {
      const translate = (key, Default) => new PreviewTranslatePipe().transform(key, { Default })
      const title = translate('XP.KEY_WORDS.Confirm', 'Confirm')
      const cancel = translate('XP.ACTIONS.Cancel', 'Cancel')
      const description = translate('XP.MESSAGE.ConfirmExitDirtyData', 'Discard unsaved changes?')
      if (key === 'remainingConfirm')
        this.alertDialog
          .confirm({ title, description, actionText: title, cancelText: cancel })
          .subscribe((confirmed) => notify(confirmed ? '已确认预览操作' : '已取消预览操作'))
      else
        this.legacyDialog
          .create({ zTitle: title, zDescription: description, zContent: '', zCancelText: cancel, zOkText: title })
          .closed.subscribe(() => notify('已关闭预览'))
      return
    }
    if (batchFourteen[key] || batchFifteen[key]) {
      const options = batchFifteen[key] ? batchFifteenOptions : batchFourteenOptions
      this.alertDialog
        .confirm(options(key, (key, params) => new PreviewTranslatePipe().transform(key, params)))
        .subscribe((confirmed) => {
          if (confirmed && key === 'runtimeRestartPrompt') this.open('runtimeRestartConfirm')
          else notify(confirmed ? '已确认预览操作，不会修改业务数据或重启服务' : '已取消预览操作')
        })
      return
    }
    const opener = key === 'remainingMcp' ? this.legacyDialog : this.dialog
    opener.open(sceneTypes[key], {
      width: widths[key],
      height: batchTwelve[key]?.height,
      maxWidth:
        batchTwo[key] ||
        batchThree[key] ||
        batchFour[key] ||
        batchFive[key] ||
        batchSix[key] ||
        batchSeven[key] ||
        batchEight[key] ||
        batchNine[key] ||
        batchTen[key] ||
        batchEleven[key] ||
        batchTwelve[key] ||
        remainingDialogs[key] ||
        batchThirteen[key]
          ? 'calc(100vw - 32px)'
          : 'calc(100vw - 2rem)',
      panelClass: 'xp-overlay-pane-dialog',
      backdropClass: 'backdrop-blur-xs-black',
      ariaLabel: names[key],
      ...(batchThirteen[key]
        ? {
            id: `preview-${key}`,
            role: key === 'roleName' ? 'dialog' : 'alertdialog',
            ariaLabel: null,
            ariaLabelledBy: key === 'roleName' ? 'role-name-dialog-title' : `preview-${key}-title`,
            ariaDescribedBy: key === 'roleName' ? null : `preview-${key}-description`,
            autoFocus: key === 'roleName' ? 'input' : '[data-testid="z-alert-dialog-cancel"]'
          }
        : {})
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
        <h1 style="font-size:30px;font-weight:600;margin:8px 0">{{ batch() === 'remaining' ? '剩余 Dialog · 统一审核' : batch() === 'fifteenth' ? '第十五批 · 10 个 Dialog' : batch() === 'fourteenth' ? '第十四批 · 10 个 Dialog' : batch() === 'thirteenth' ? '第十三批 · 10 个 Dialog' : batch() === 'twelfth' ? '第十二批 · 10 个 Dialog' : batch() === 'eleventh' ? '第十一批 · 10 个 Dialog' : batch() === 'tenth' ? '第十批 · 10 个 Dialog' : batch() === 'ninth' ? '第九批 · 10 个 Dialog' : batch() === 'eighth' ? '第八批 · 10 个 Dialog' : batch() === 'seventh' ? '第七批 · 10 个 Dialog' : batch() === 'sixth' ? '第六批 · 10 个 Dialog' : batch() === 'fifth' ? '第五批 · 10 个 Dialog' : batch() === 'fourth' ? '第四批 · 10 个 Dialog' : batch() === 'third' ? '第三批 · 10 个 Dialog' : batch() === 'second' ? '第二批 · 10 个 Dialog' : '首批 · 5 个 Dialog' }}</h1></div>
      <div class="preview-controls">
        <select aria-label="预览批次" [value]="batch()" (change)="batch.set($event.target.value)"><option value="remaining">剩余全部</option><option value="fifteenth">第十五批</option><option value="fourteenth">第十四批</option><option value="thirteenth">第十三批</option><option value="twelfth">第十二批</option><option value="eleventh">第十一批</option><option value="tenth">第十批</option><option value="ninth">第九批</option><option value="eighth">第八批</option><option value="seventh">第七批</option><option value="sixth">第六批</option><option value="fifth">第五批</option><option value="fourth">第四批</option><option value="third">第三批</option><option value="second">第二批</option><option value="first">首批</option></select>
        <button (click)="toggleTheme()">{{ dark() ? '浅色' : '深色' }}</button>
        <button (click)="language.set(language() === 'zh' ? 'en' : 'zh')">{{ language() === 'zh' ? 'English' : '中文' }}</button>
        <button (click)="busy.set(!busy())">{{ busy() ? '恢复正常状态' : '查看处理中状态' }}</button>
      </div>
    </div>
    <p class="preview-note">真实模板与共享 UI 组件 · 示例数据。共享布局 · 14px 正文 · 表单与普通操作 36px · 关键流程 40px · 同组等高。<br>点击打开场景，按 Escape 或点击遮罩返回。预览不会调用业务 API。</p>
    @if (batch() === 'remaining') { <p class="preview-note">生产 Dialog 模板和公共组件；业务接口、模型与技能列表使用本地示例。兼容组件当前没有业务入口，作为组件预览保留。</p><label>向导类型 <select aria-label="向导类型" [value]="wizardMode()" (change)="wizardMode.set($event.target.value)"><option value="agent">数字专家</option><option value="workflow">工作流</option><option value="knowledge">知识流水线</option><option value="copilot">其他类型</option></select></label> }
    @if (batch() === 'fifteenth') {
      <p class="preview-note">10 个确认场景通过生产 Dialog 服务展示；套餐、人数和项目成员使用示例数据。可以切换批量操作检查普通与危险按钮，预览不会修改业务数据。</p>
      <label>批量会员操作 <select aria-label="批量会员操作" [value]="bulkMembershipAction()" (change)="bulkMembershipAction.set($event.target.value)"><option value="assign">分配套餐</option><option value="renew">续期</option><option value="pause">暂停</option><option value="resume">恢复</option><option value="revoke">撤销</option></select></label>
    }
    @if (batch() === 'fourteenth') { <p class="preview-note">本批通过生产确认弹窗服务展示 10 个场景，保留普通与危险操作样式，以及插件重启的两步确认和遮罩关闭限制。名称等业务参数为本地示例。</p> }
    @if (batch() === 'thirteenth') {
      <p class="preview-note">角色名称表单与 9 个 Agent Evolution 确认场景，使用生产模板、共享组件及真实翻译；动态业务参数为本地示例。</p>
      <label>角色名称场景 <select aria-label="角色名称场景" [value]="roleNameMode()" (change)="roleNameMode.set($event.target.value)"><option value="create">新建角色</option><option value="rename">重命名角色</option></select></label>
      <label>审批路径 <select aria-label="审批路径" [value]="approvalPath()" (change)="approvalPath.set($event.target.value)"><option value="reviewer">评审人</option><option value="administrator">管理员</option></select></label>
    }
    @if (batch() === 'twelfth') { <p class="preview-note">生产 Dialog 模板和共享组件；技能列表使用生产子模板。文件内容、设置面板和业务数据为本地示例，实际业务请在平台验收。任务详情保留侧栏样式。</p> }
    @if (batch() === 'eleventh') { <p class="preview-note">生产 Dialog 模板、共享 UI 和 Emoji 选择器；Formly、Monaco、执行详情和业务数据使用本地示例适配。实际业务操作请在平台验收。</p><label>连接器场景 <select [value]="connectorPreviewMode()" (change)="connectorPreviewMode.set($event.target.value)"><option value="configure">连接配置</option><option value="pending">扫码授权</option><option value="active">已连接</option></select></label> }
    @if (batch() === 'tenth') { <p class="preview-note">生产模板与技能子模板；业务接口和 Formly 配置使用本地示例，不会安装插件或修改数据。</p><label>工作流操作场景 <select [value]="workflowPanelMode()" (change)="workflowPanelMode.set($event.target.value)"><option value="discard">未保存离开</option><option value="archive">归档</option><option value="export">导出</option><option value="templates">模板选择</option></select></label> }
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
    <p class="preview-note">在独立 worktree 中实现；业务效果请在主仓库运行后审核。</p>
    @if (note()) { <p role="status" class="preview-note">{{ note() }}</p> }
  </main>
`
})(PreviewApp)
bootstrapApplication(PreviewApp, {
  providers: [
    provideRouter([]),
    provideZonelessChangeDetection(),
    ui.provideZard(),
    importProvidersFrom(TranslateModule.forRoot())
  ]
})
  .then((app) => {
    const translate = app.injector.get(TranslateService)
    translate.setTranslation('zh', locales.zh)
    translate.use('zh')
  })
  .catch(console.error)
