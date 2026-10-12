import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import { ApiAuthType, XpertAPIService } from '../../../@core'
import { XpertWorkflowAuthorizationComponent } from './authorization.component'

describe('Workflow authorization controls', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('preserves scalar auth values and variable expressions through radio changes and save', async () => {
    const close = jest.fn()
    await TestBed.configureTestingModule({
      imports: [XpertWorkflowAuthorizationComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        { provide: DialogRef, useValue: { close } },
        { provide: XpertAPIService, useValue: {} },
        {
          provide: DIALOG_DATA,
          useValue: {
            authorization: {
              auth_type: ApiAuthType.NONE,
              api_key_type: 'custom',
              api_key_header: 'X-API-Key',
              api_key_value: '{{environment.API_KEY}}'
            },
            variables: []
          }
        }
      ]
    }).compileComponents()
    const fixture = TestBed.createComponent(XpertWorkflowAuthorizationComponent)
    const settle = async () => {
      fixture.detectChanges()
      await fixture.whenStable()
      fixture.detectChanges()
    }
    await settle()
    const root: HTMLElement = fixture.nativeElement
    root.querySelector<HTMLInputElement>(`input[type="radio"][value="${ApiAuthType.API_KEY}"]`)!.click()
    await settle()
    const header = root.querySelector<HTMLInputElement>('input[z-input]')!
    expect(header.value).toBe('X-API-Key')
    header.value = 'X-Research-Key'
    header.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    root.querySelector<HTMLInputElement>('input[type="radio"][value="bearer"]')!.click()
    await settle()
    expect(root.querySelector('input[z-input]')).toBeNull()
    fixture.componentInstance.save()
    expect(close).toHaveBeenCalledWith({
      auth_type: ApiAuthType.API_KEY,
      api_key_type: 'bearer',
      api_key_header: 'X-Research-Key',
      api_key_value: '{{environment.API_KEY}}'
    })
  })
})
