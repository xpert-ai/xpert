import { DIALOG_DATA } from '@angular/cdk/dialog'
import { Injectable, computed, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl } from '@angular/forms'
import type { TXpertTeamDraft } from '@xpert-ai/contracts'
import { getErrorMessage } from '@cloud/app/@core/types'
import { isEqual } from 'lodash-es'
import type { Observable } from 'rxjs'
import { createXpertSettingsForm } from './xpert-settings.form'
import { applyXpertSettingsChanges } from './xpert-settings.patch'
import {
  XPERT_DRAFT_SETTINGS_SECTIONS,
  type XpertSettingsDialogData,
  type XpertSettingsSection
} from './xpert-settings.types'

@Injectable()
export class XpertSettingsEditor {
  readonly data = inject<XpertSettingsDialogData>(DIALOG_DATA)
  readonly source = this.data.source
  readonly draftOnly = this.data.saveMode === 'draft'
  readonly form = createXpertSettingsForm(this.source.draft().team)
  readonly section = signal<XpertSettingsSection>(this.data.section === 'runtime' ? 'capabilities' : this.data.section)
  readonly revision = signal(0)
  readonly closing = signal(false)
  readonly confirmDiscard = signal(false)
  readonly publishing = signal(false)
  readonly savingDraft = signal(false)
  readonly saveError = signal<string | null>(null)
  readonly composing = signal(false)
  readonly publishError = signal<string | null>(null)
  private readonly publishedDraft = signal<TXpertTeamDraft | null>(
    this.source.draft().team.publishAt && !this.source.draft().team.draft ? structuredClone(this.source.draft()) : null
  )
  readonly published = computed(
    () => !this.draftOnly && !this.source.unsaved() && isEqual(this.publishedDraft(), this.source.draft())
  )
  private applied = this.form.getRawValue()
  readonly invalidSections = computed<XpertSettingsSection[]>(() => {
    this.revision()
    const value = this.form.getRawValue()
    return XPERT_DRAFT_SETTINGS_SECTIONS.filter(
      ({ key }) => this.form.controls[key].invalid && !isEqual(this.applied[key], value[key])
    ).map(({ key }) => (key === 'runtime' ? 'capabilities' : key))
  })

  constructor() {
    for (const { key } of XPERT_DRAFT_SETTINGS_SECTIONS) {
      const changes: Observable<unknown> = this.form.controls[key].valueChanges
      changes.pipe(takeUntilDestroyed()).subscribe(() => {
        this.confirmDiscard.set(false)
        this.revision.update((value) => value + 1)
        const next = this.form.getRawValue()
        if (this.form.controls[key].invalid || isEqual(this.applied[key], next[key])) return
        const before = this.applied
        this.source.update((draft) => applyXpertSettingsChanges(draft, before, next, key))
        this.applied = { ...this.applied, [key]: next[key] }
      })
    }
  }

  select(section: XpertSettingsSection) {
    const next = section === 'runtime' ? 'capabilities' : section
    this.section.set(next)
    this.data.selectSection(next)
    this.confirmDiscard.set(false)
  }

  setText(control: FormControl<string>, value: string) {
    control.markAsDirty()
    control.setValue(value)
  }

  async save(): Promise<boolean> {
    if (!this.source.unsaved()) return true
    try {
      await this.source.save()
      return true
    } catch {
      return false
    }
  }

  async saveNow() {
    this.form.markAllAsTouched()
    if (this.invalidSections().length) this.select(this.invalidSections()[0])
    await this.save()
  }

  syncCapabilityRuntime() {
    const runtime = createXpertSettingsForm(this.source.draft().team).controls.runtime.getRawValue()
    this.form.controls.runtime.reset(runtime, { emitEvent: false })
    this.applied = { ...this.applied, runtime }
    this.revision.update((value) => value + 1)
  }

  async saveAndPublish(prepare?: () => Promise<boolean>): Promise<boolean> {
    if (this.draftOnly || !this.data.publish) return false
    return this.persist(true, prepare)
  }

  async saveDraft(prepare?: () => Promise<boolean>): Promise<boolean> {
    return this.persist(false, prepare)
  }

  private async persist(publish: boolean, prepare?: () => Promise<boolean>): Promise<boolean> {
    if (this.publishing() || this.savingDraft() || this.composing() || this.closing()) return false
    this.form.markAllAsTouched()
    if (this.invalidSections().length) {
      this.select(this.invalidSections()[0])
      return false
    }
    const pending = publish ? this.publishing : this.savingDraft
    pending.set(true)
    this.publishError.set(null)
    this.saveError.set(null)
    try {
      if (prepare && !(await prepare())) return false
      // Always persist a draft, including after a previous publication cleared it.
      do {
        await this.source.save()
      } while (this.source.unsaved())
      if (publish) {
        await this.data.publish()
        this.publishedDraft.set(structuredClone(this.source.draft()))
      }
      return true
    } catch (error) {
      const errorState = publish ? this.publishError : this.saveError
      errorState.set(getErrorMessage(error))
      return false
    } finally {
      pending.set(false)
    }
  }
}
