import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, ModelAccessChannelEnum, ModelAccessOwnershipScopeEnum } from '@xpert-ai/contracts'
import {
  ModelAccessActionDialogComponent,
  ModelAccessActionDialogData,
  ModelAccessActionMode
} from './model-access-action-dialog.component'

describe('ModelAccessActionDialogComponent', () => {
  let dialogRef: { close: jest.Mock }
  let component: ModelAccessActionDialogComponent
  let fixture: ComponentFixture<ModelAccessActionDialogComponent>

  async function create(mode: ModelAccessActionMode) {
    dialogRef = { close: jest.fn() }
    const data: ModelAccessActionDialogData = {
      mode,
      target: {
        userName: 'Alice',
        model: 'test-model',
        channel: ModelAccessChannelEnum.ExternalApi,
        ownershipScope: ModelAccessOwnershipScopeEnum.Organization,
        reason: 'Compare models',
        validUntil: '2027-03-14',
        modelSnapshot: {
          copilotId: 'copilot',
          provider: 'Example provider',
          modelType: AiModelTypeEnum.LLM,
          model: 'test-model',
          capturedAt: '2026-10-13'
        }
      }
    }
    await TestBed.configureTestingModule({
      imports: [ModelAccessActionDialogComponent, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        { provide: DialogRef, useValue: dialogRef },
        { provide: DIALOG_DATA, useValue: data }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(ModelAccessActionDialogComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  }

  afterEach(() => TestBed.resetTestingModule())

  it.each(['approve', 'extend'] as const)('formats dates and keeps optional notes for %s', async (mode) => {
    await create(mode)
    component.form.setValue({ validUntil: new Date(2027, 2, 14), message: '  Approved  ' })
    component.submit()
    expect(dialogRef.close).toHaveBeenCalledWith({ validUntil: '2027-03-14', note: 'Approved' })
    expect(fixture.nativeElement.querySelector('z-date-picker')).not.toBeNull()
  })

  it('keeps the existing no-expiration behavior', async () => {
    await create('approve')
    component.submit()
    expect(dialogRef.close).toHaveBeenCalledWith({ validUntil: null, note: null })
  })

  it.each(['reject', 'revoke'] as const)('requires a non-whitespace reason for %s', async (mode) => {
    await create(mode)
    expect(fixture.nativeElement.querySelector('z-date-picker')).toBeNull()
    const submit: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]')
    expect(submit.disabled).toBe(true)
    component.form.controls.message.setValue('   ')
    component.submit()
    expect(dialogRef.close).not.toHaveBeenCalled()
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('z-form-message')?.textContent).toContain(
      'XP.ModelAccessSettings.ReasonHint'
    )
    component.form.controls.message.setValue('  No longer required  ')
    fixture.detectChanges()
    expect(submit.disabled).toBe(false)
    component.submit()
    expect(dialogRef.close).toHaveBeenCalledWith({ reason: 'No longer required' })
  })

  it('shows the target context, labels the reason, limits note length and cancels without saving', async () => {
    await create('approve')
    for (const text of [
      'Alice',
      'test-model',
      'Example provider',
      'Compare models',
      '2027-03-14',
      'XP.ModelAccess.Scope.organization'
    ]) {
      expect(fixture.nativeElement.textContent).toContain(text)
    }
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea')
    expect(fixture.nativeElement.querySelector('label')?.htmlFor).toBe(textarea.id)
    component.form.controls.message.setValue('a'.repeat(1001))
    component.submit()
    expect(dialogRef.close).not.toHaveBeenCalled()
    component.close()
    expect(dialogRef.close).toHaveBeenCalledWith(null)
  })
})
