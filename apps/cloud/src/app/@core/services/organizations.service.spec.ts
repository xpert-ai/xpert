import { HttpClient } from '@angular/common/http'
import { of } from 'rxjs'
import { OrganizationsService } from './organizations.service'

describe('OrganizationsService', () => {
  it('serializes tenant organization paging and server-side search options', () => {
    const http = {
      get: jest.fn(() => of({ items: [], total: 0 }))
    }
    const service = new OrganizationsService(http as unknown as HttpClient)

    service
      .getPage({
        take: 10,
        skip: 20,
        search: 'searched',
        relations: ['featureOrganizations', 'featureOrganizations.feature']
      })
      .subscribe()

    const requestOptions = http.get.mock.calls[0][1]
    expect(JSON.parse(requestOptions.params.data)).toEqual({
      relations: ['featureOrganizations', 'featureOrganizations.feature'],
      findInput: {
        isActive: true,
        name: { $ilike: '%searched%' }
      },
      take: 10,
      skip: 20,
      order: { name: 'ASC' }
    })
  })
})
