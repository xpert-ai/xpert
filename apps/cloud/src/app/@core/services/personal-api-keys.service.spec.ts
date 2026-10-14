import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { API_PREFIX } from '../state/constants'
import { PersonalApiKeysService } from './personal-api-keys.service'

describe('PersonalApiKeysService API-key routes', () => {
  it('uses the existing API-key module for listing, creation and revocation', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] })
    const service = TestBed.inject(PersonalApiKeysService)
    const http = TestBed.inject(HttpTestingController)
    const url = `${API_PREFIX}/api-key/personal`
    service.list().subscribe()
    const list = http.expectOne(url)
    expect(list.request.method).toBe('GET')
    list.flush([])
    service.create({ name: 'CLI', lifetime: '90' }).subscribe()
    const create = http.expectOne(url)
    expect(create.request.method).toBe('POST')
    expect(create.request.body).toEqual({ name: 'CLI', lifetime: '90' })
    create.flush({})
    service.revoke('key-id').subscribe()
    const revoke = http.expectOne(`${url}/key-id`)
    expect(revoke.request.method).toBe('DELETE')
    revoke.flush(null)
    http.verify()
    TestBed.resetTestingModule()
  })
})
