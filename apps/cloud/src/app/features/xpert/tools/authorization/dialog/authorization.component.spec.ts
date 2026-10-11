import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { ApiAuthType } from 'apps/cloud/src/app/@core/types'
import { XpertToolAuthorizationComponent } from './authorization.component'

describe('Tool authorization controls', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('retains the listbox array result expected by the authorization field', async () => {
    const close = jest.fn()
    await TestBed.configureTestingModule({
      imports: [XpertToolAuthorizationComponent, TranslateModule.forRoot()],
      providers: [
        { provide: DialogRef, useValue: { close } },
        {
          provide: DIALOG_DATA,
          useValue: { auth_type: [ApiAuthType.NONE], api_key_header_prefix: ['bearar'], api_key_value: 'preview-key' }
        }
      ]
    }).compileComponents()
    const fixture = TestBed.createComponent(XpertToolAuthorizationComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    const root: HTMLElement = fixture.nativeElement
    const option = Array.from(root.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (el) => el.textContent?.trim() === 'API Key'
    )!
    option.click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(root.querySelector('input[formControlName="api_key_value"]')).not.toBeNull()
    fixture.componentInstance.save()
    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({
        auth_type: [ApiAuthType.API_KEY],
        api_key_header_prefix: ['bearar'],
        api_key_value: 'preview-key'
      })
    )
  })
})
