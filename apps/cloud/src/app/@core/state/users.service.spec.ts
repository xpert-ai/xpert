import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { UserType } from '@xpert-ai/contracts'
import { API_PREFIX } from './constants'
import { CURRENT_USER_BOOTSTRAP_RELATIONS, CURRENT_USER_BOOTSTRAP_SELECT, UsersService } from './users.service'

describe('UsersService current-user bootstrap', () => {
  let service: UsersService
  let http: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), UsersService]
    })
    service = TestBed.inject(UsersService)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    http.verify()
    TestBed.resetTestingModule()
  })

  it.each([UserType.USER, UserType.COMMUNICATION])(
    'requests explicit account identity during bootstrap: %s',
    async (type) => {
      const response = service.getMe([...CURRENT_USER_BOOTSTRAP_RELATIONS], CURRENT_USER_BOOTSTRAP_SELECT, {
        limitOrganizations: true
      })
      const request = http.expectOne((request) => request.url === `${API_PREFIX}/user/me`)
      const data: unknown = JSON.parse(request.request.params.get('data'))
      request.flush({ id: 'user', tenantId: 'tenant', type })

      expect(request.request.method).toBe('GET')
      expect(data).toEqual(
        expect.objectContaining({
          select: expect.objectContaining({ id: true, tenantId: true, type: true }),
          limitOrganizations: true
        })
      )
      await expect(response).resolves.toMatchObject({ id: 'user', tenantId: 'tenant', type })
    }
  )
})
