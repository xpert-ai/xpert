import { DialogRef } from '@angular/cdk/dialog'
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardButtonComponent, ZardInputDirective, ZardSelectImports, ZardSelectValue } from '@xpert-ai/headless-ui'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { XpertSettingsEditor } from './xpert-settings.editor'
import { XPERT_SETTINGS_SECTIONS, type XpertSettingsSection } from './xpert-settings.types'
import { SettingsBasicComponent } from './settings-basic.component'
import { SettingsConversationComponent } from './settings-conversation.component'
import { SettingsWorkbenchComponent } from './settings-workbench.component'
import { SettingsMemoryComponent } from './settings-memory.component'
import { SettingsCapabilitiesComponent } from './settings-capabilities.component'
import { AssistantPersonalizationComponent } from '../../../features/setting/assistant/assistant-personalization.component'
import { AssistantTriggersComponent } from '../../../features/setting/assistant/assistant-triggers.component'
import { XpertSettingsContextService } from '../../../@core/services/xpert-settings-context.service'
import { ASSISTANT_SETTINGS_CONTEXT } from './assistant-settings-context'
import { SettingsExternalExpertsComponent } from './settings-external-experts.component'
import { SettingsSubagentsComponent } from './settings-subagents.component'
import { SettingsStatisticsComponent } from './settings-statistics.component'
import { SettingsMiddlewareComponent } from './settings-middleware.component'

@Component({
  selector: 'xp-xpert-settings-dialog',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardSelectImports,
    EmojiAvatarComponent,
    SettingsBasicComponent,
    SettingsConversationComponent,
    SettingsWorkbenchComponent,
    SettingsMemoryComponent,
    SettingsCapabilitiesComponent,
    AssistantPersonalizationComponent,
    AssistantTriggersComponent,
    SettingsStatisticsComponent,
    SettingsExternalExpertsComponent,
    SettingsSubagentsComponent,
    SettingsMiddlewareComponent
  ],
  providers: [
    XpertSettingsEditor,
    XpertSettingsContextService,
    { provide: ASSISTANT_SETTINGS_CONTEXT, useExisting: XpertSettingsContextService }
  ],
  encapsulation: ViewEncapsulation.None,
  styleUrl: './xpert-settings-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'text-base [--spacing:4px] [&_[z-button]]:h-10 [&_[z-button]]:min-w-10 [&_[z-button]]:gap-2 [&_[z-button]]:rounded-xl [&_[z-button]]:px-4 [&_[z-button]]:text-base flex h-[min(780px,calc(100dvh-64px))] w-[min(1120px,calc(100vw-48px))] max-sm:h-[100dvh] max-sm:w-screen'
  },
  templateUrl: './xpert-settings-dialog.component.html'
})
export class XpertSettingsDialogComponent {
  readonly editor = inject(XpertSettingsEditor)
  readonly source = this.editor.source
  private readonly ref = inject(DialogRef)
  private readonly translate = inject(TranslateService)
  private readonly language = toSignal(this.translate.onLangChange)
  readonly content = viewChild<ElementRef<HTMLElement>>('content')
  readonly query = signal('')
  readonly personalization = viewChild(AssistantPersonalizationComponent)
  readonly subagents = viewChild(SettingsSubagentsComponent)
  readonly skills = viewChild<SettingsMiddlewareComponent>('skills')
  readonly middleware = viewChild<SettingsMiddlewareComponent>('middleware')
  readonly visitedSections = signal(new Set<XpertSettingsSection>([this.editor.section()]))
  readonly pendingSections = computed<XpertSettingsSection[]>(() => [
    ...(this.personalization()?.dirty ? ['personalization' as const] : []),
    ...(this.subagents()?.dirty() ? ['subagents' as const] : []),
    ...(this.skills()?.dirty() ? ['skills' as const] : []),
    ...(this.middleware()?.dirty() ? ['middleware' as const] : [])
  ])
  readonly statistics = viewChild(SettingsStatisticsComponent)
  readonly sections = computed(() =>
    XPERT_SETTINGS_SECTIONS.filter(({ key }) => key !== 'personalization' || !!this.editor.data.binding)
  )
  readonly groups = ['Basic', 'Experience', 'Execution']
  readonly filteredSections = computed(() => {
    this.language()
    const query = this.query().trim().toLocaleLowerCase()
    return this.sections().filter(
      ({ key }) =>
        !query ||
        [
          key,
          this.translate.instant(`XP.XpertSettings.Menu.${key}`),
          this.translate.instant(`XP.XpertSettings.Description.${key}`),
          this.translate.instant(`XP.XpertSettings.Keywords.${key}`)
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query)
    )
  })
  readonly invalid = computed(() => this.editor.invalidSections().includes(this.editor.section()))

  constructor() {
    this.ref.backdropClick.pipe(takeUntilDestroyed()).subscribe(() => {
      void this.close()
    })
    this.ref.keydownEvents.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        void this.close()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        event.stopPropagation()
        void this.saveCurrent()
      }
    })
  }
  groupSections(group: string) {
    return this.filteredSections().filter((section) => section.group === group)
  }
  select(section: XpertSettingsSection) {
    this.visitedSections.update((visited) => new Set([...visited, section]))
    this.editor.select(section)
    this.content()?.nativeElement.scrollTo({ top: 0 })
  }
  selectFromMenu(value: ZardSelectValue | ZardSelectValue[]) {
    const section = this.sections().find((section) => section.key === value)
    if (section) this.select(section.key)
  }
  async saveCurrent() {
    if (this.editor.section() === 'personalization') await this.personalization()?.save()
    else if (this.editor.section() === 'subagents') await this.subagents()?.save()
    else if (this.editor.section() === 'skills') await this.skills()?.save()
    else if (this.editor.section() === 'middleware') await this.middleware()?.save()
    else if (this.editor.section() !== 'statistics') await this.editor.saveNow()
  }
  continueEditing() {
    this.editor.confirmDiscard.set(false)
    this.select(this.editor.invalidSections()[0] ?? this.pendingSections()[0] ?? this.editor.section())
  }
  async close(discardInvalid = false) {
    if (this.editor.closing() || this.personalization()?.saving()) return
    if ((this.editor.invalidSections().length || this.pendingSections().length) && !discardInvalid) {
      this.editor.confirmDiscard.set(true)
      return
    }
    this.editor.closing.set(true)
    do {
      if (!(await this.editor.save())) {
        this.editor.closing.set(false)
        return
      }
    } while (this.source.unsaved())
    this.ref.close(this.source.draft())
  }
}
