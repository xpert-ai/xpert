import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { ReferralService } from '@cloud/app/@core/state'

describe('ReferralService invitation tenant context', () => {
  let httpMock: HttpTestingController
  let service: ReferralService

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ReferralService]
    })
    httpMock = TestBed.inject(HttpTestingController)
    service = TestBed.inject(ReferralService)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('checks referral availability in the invitation tenant', async () => {
    const result = service.getAvailability('tenant-invite')
    const request = httpMock.expectOne('/api/referral/availability')

    expect(request.request.headers.get('Tenant-Id')).toBe('tenant-invite')
    request.flush(true)
    await expect(result).resolves.toBe(true)
  })

  it('validates referral codes in the invitation tenant', async () => {
    const result = service.validateCode('ABC234DEFG', 'tenant-invite')
    const request = httpMock.expectOne(
      (candidate) => candidate.url === '/api/referral/validate' && candidate.params.get('code') === 'ABC234DEFG'
    )

    expect(request.request.headers.get('Tenant-Id')).toBe('tenant-invite')
    request.flush(true)
    await expect(result).resolves.toBe(true)
  })
})
