import { HttpErrorResponse } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { throwError } from 'rxjs'
import { XpertTaskService } from '../../@core'
import { XpertProjectApiService } from './project-api.service'
import { XpertProjectFacade } from './project.facade'

describe('XpertProjectFacade', () => {
  let api: {
    list: jest.Mock
  }

  beforeEach(() => {
    api = {
      list: jest.fn()
    }

    TestBed.configureTestingModule({
      providers: [
        XpertProjectFacade,
        {
          provide: XpertProjectApiService,
          useValue: api
        },
        {
          provide: XpertTaskService,
          useValue: { getAll: jest.fn() }
        }
      ]
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('preserves the server error when loading projects fails', async () => {
    api.list.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            error: { message: 'Project permission is required' }
          })
      )
    )

    const facade = TestBed.inject(XpertProjectFacade)

    await facade.loadProjects()

    expect(facade.projects()).toEqual([])
    expect(facade.error()).toBe('Project permission is required')
  })
})
