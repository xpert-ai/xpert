jest.mock('@xpert-ai/cloud/state', () => ({
  Store: class Store {}
}))

jest.mock('../@core', () => ({
  XpertAPIService: class XpertAPIService {}
}))

import { TestBed } from '@angular/core/testing'
import { Router, UrlTree } from '@angular/router'
import { redirectLegacyPublicChatkitRoute, routes } from './routes'

describe('public xpert routes', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('redirects /x/:name to the ChatKit public entry', () => {
    const route = routes.find((item) => item.path === ':name')

    expect(route?.component).toBeUndefined()
    expect(route?.redirectTo).toEqual(expect.any(Function))
  })

  it('redirects /x/:name/c/:id to the ChatKit public conversation entry', () => {
    const route = routes.find((item) => item.path === ':name/c/:id')

    expect(route?.component).toBeUndefined()
    expect(route?.redirectTo).toEqual(expect.any(Function))
  })

  it('preserves query params and fragment when redirecting old conversation URLs', () => {
    const urlTree = {} as UrlTree
    const createUrlTree = jest.fn(() => urlTree)

    TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: {
            createUrlTree
          }
        }
      ]
    })

    const result = TestBed.runInInjectionContext(() =>
      redirectLegacyPublicChatkitRoute({
        params: {
          name: 'sales',
          id: 'thread-1'
        },
        queryParams: {
          source: 'qr'
        },
        fragment: 'top'
      } as Parameters<typeof redirectLegacyPublicChatkitRoute>[0])
    )

    expect(result).toBe(urlTree)
    expect(createUrlTree).toHaveBeenCalledWith(['/x-chatkit', 'x', 'sales', 'c', 'thread-1'], {
      queryParams: {
        source: 'qr'
      },
      fragment: 'top'
    })
  })
})
