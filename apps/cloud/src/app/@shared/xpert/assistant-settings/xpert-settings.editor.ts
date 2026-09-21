import { DIALOG_DATA } from '@angular/cdk/dialog'
import { Injectable, computed, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl } from '@angular/forms'
import { isEqual } from 'lodash-es'
import { Subject, debounceTime, type Observable } from 'rxjs'
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
  readonly form = createXpertSettingsForm(this.source.draft().team)
  readonly section = signal(this.data.section)
  readonly revision = signal(0)
  readonly closing = signal(false)
  readonly confirmDiscard = signal(false)
  private applied = this.form.getRawValue()
  private readonly autosave = new Subject<void>()
  readonly invalidSections = computed<XpertSettingsSection[]>(() => {
    this.revision()
    const value = this.form.getRawValue()
    return XPERT_DRAFT_SETTINGS_SECTIONS.filter(
      ({ key }) => this.form.controls[key].invalid && !isEqual(this.applied[key], value[key])
    ).map(({ key }) => key)
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
        this.autosave.next()
      })
    }
    this.autosave.pipe(debounceTime(600), takeUntilDestroyed()).subscribe(() => {
      void this.save()
    })
  }

  select(section: XpertSettingsSection) {
    this.section.set(section)
    this.data.selectSection(section)
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
}
