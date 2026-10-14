import { DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { PersonalApiKeyDialogComponent } from './personal-api-key-dialog.component'

describe('PersonalApiKeyDialogComponent', () => {
  it('rejects blank names, defaults to 90 days and trims valid input', async () => {
    const close = jest.fn()
    await TestBed.configureTestingModule({
      imports: [PersonalApiKeyDialogComponent, TranslateModule.forRoot()],
      providers: [{ provide: DialogRef, useValue: { close } }]
    }).compileComponents()
    const fixture = TestBed.createComponent(PersonalApiKeyDialogComponent)
    fixture.detectChanges()
    const component = fixture.componentInstance
    component.form.controls.name.setValue('   ')
    component.submit()
    fixture.detectChanges()
    expect(close).not.toHaveBeenCalled()
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull()
    component.form.controls.name.setValue(' CLI ')
    component.submit()
    expect(close).toHaveBeenCalledWith({ name: 'CLI', lifetime: '90' })
    TestBed.resetTestingModule()
  })
})
