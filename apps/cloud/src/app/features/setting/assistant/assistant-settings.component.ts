import { A11yModule } from '@angular/cdk/a11y'
import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog'
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  TemplateRef,
  signal,
  viewChild
} from '@angular/core'
import { FormControl, FormRecord, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardButtonComponent, ZardIconComponent, ZardInputDirective, ZardSwitchComponent } from '@xpert-ai/headless-ui'
import { AssistantSettingsSection, SETTINGS_BLOCKS, SETTINGS_SECTIONS } from './assistant-settings.data'

@Component({
  selector: 'xp-assistant-settings',
  standalone: true,
  imports: [
    A11yModule,
    DialogModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ZardSwitchComponent,
    ZardIconComponent
  ],
  templateUrl: './assistant-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AssistantSettingsComponent implements OnDestroy {
  readonly dialogRef = inject<DialogRef<void, AssistantSettingsComponent>>(DialogRef)
  readonly dialog = inject(Dialog)
  readonly translate = inject(TranslateService)
  readonly activeSection = signal<AssistantSettingsSection>('assistant')
  readonly sections = SETTINGS_SECTIONS
  readonly blocks = SETTINGS_BLOCKS
  readonly form = new FormRecord<FormControl<string | boolean>>({})
  readonly sheet = signal<string | null>(null)
  readonly sheetInput = new FormControl('', { nonNullable: true })
  readonly notice = signal<string | null>(null)
  readonly sheetDrafts = signal<Record<string, string>>({})
  readonly sheetTemplate = viewChild.required<TemplateRef<unknown>>('sheetTemplate')
  private sheetDialog: DialogRef<unknown, unknown> | null = null
  readonly content = viewChild<ElementRef<HTMLElement>>('content')

  constructor() {
    for (const blocks of Object.values(SETTINGS_BLOCKS)) {
      for (const block of blocks) {
        for (const row of block.rows) {
          this.form.addControl(row.key, new FormControl(row.value ?? '', { nonNullable: true }))
        }
      }
    }
  }

  get title() {
    return this.sections.find((item) => item.key === this.activeSection())?.title ?? 'Assistant'
  }

  selectSection(section: AssistantSettingsSection) {
    this.activeSection.set(section)
    this.notice.set(null)
    this.content()?.nativeElement.scrollTo({ top: 0 })
  }

  openSheet(key: string) {
    this.sheetInput.setValue(this.sheetDrafts()[key] ?? '')
    this.sheet.set(key)
    this.notice.set(null)
    this.sheetDialog = this.dialog.open(this.sheetTemplate(), {
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog',
      ariaLabel: this.translate.instant('XP.AssistantSettings.' + key)
    })
    this.sheetDialog.closed.subscribe(() => {
      this.sheet.set(null)
      this.sheetDialog = null
    })
  }
  closeSheet() {
    this.sheetDialog?.close()
  }
  finishSheet() {
    const key = this.sheet()
    if (key) this.sheetDrafts.update((drafts) => ({ ...drafts, [key]: this.sheetInput.value }))
    this.closeSheet()
    this.notice.set('DraftOnly')
  }
  closeSettings() {
    this.dialogRef.close()
  }
  ngOnDestroy() {
    this.sheetDialog?.close()
  }
}
