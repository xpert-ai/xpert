import { HttpErrorResponse } from '@angular/common/http'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { ActivatedRoute } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import { AuthService } from '@cloud/app/@core/state'
import { XP_AUTH_OPTIONS } from '../auth.options'
import { VarifyEmailComponent } from './verify-email.component'

describe('email verification feedback', () => {
  let fixture: ComponentFixture<VarifyEmailComponent>
  let verification: Subject<void>
  const verifyEmail = jest.fn()
  beforeEach(async () => {
    verification = new Subject<void>()
    verifyEmail.mockReset().mockReturnValue(verification)
    await TestBed.configureTestingModule({
      declarations: [VarifyEmailComponent],
      providers: [
        { provide: AuthService, useValue: { verifyEmail } },
        {
          provide: ActivatedRoute,
          useValue: { queryParams: new Subject(), snapshot: { queryParams: { token: 'verification-token' } } }
        },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
        { provide: XP_AUTH_OPTIONS, useValue: {} }
      ]
    })
      .overrideComponent(VarifyEmailComponent, { set: { template: '' } })
      .compileComponents()
    fixture = TestBed.createComponent(VarifyEmailComponent)
  })
  afterEach(() => {
    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('reports successful verification separately from errors', () => {
    verification.next()
    expect(verifyEmail).toHaveBeenCalledWith('verification-token')
    expect(fixture.componentInstance.messages).toEqual(['Auth.VarifyEmailSuccess'])
    expect(fixture.componentInstance.errors).toEqual([])
  })

  it.each([404, 410])('shows an invalid-link message for HTTP %s', (status) => {
    verification.error(new HttpErrorResponse({ status, error: { message: 'Not Found' } }))
    expect(fixture.componentInstance.errors).toEqual(['Auth.VerifyEmailInvalidLink'])
    expect(fixture.componentInstance.messages).toEqual([])
  })

  it.each([
    { body: { message: ' Verification failed ' }, message: 'Verification failed' },
    { body: { message: ['First issue', 'Second issue'] }, message: 'First issue Second issue' },
    { body: { diagnostic: {} }, message: 'Auth.VerifyEmailFailed' }
  ])('renders a readable failure message for $body', ({ body, message }) => {
    verification.error(new HttpErrorResponse({ status: 400, error: body }))
    expect(fixture.componentInstance.errors).toEqual([message])
    expect(fixture.componentInstance.messages).toEqual([])
  })
})
