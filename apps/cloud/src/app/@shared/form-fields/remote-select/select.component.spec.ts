import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { XpertRemoteSelectComponent } from './select.component'

jest.mock('echarts/core', () => ({
  registerTheme: jest.fn()
}))

describe('XpertRemoteSelectComponent', () => {
  let httpMock: HttpTestingController

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, TranslateModule.forRoot(), XpertRemoteSelectComponent]
    }).compileComponents()

    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
    TestBed.resetTestingModule()
  })

  it('passes remote select params through as flat query parameters', () => {
    const fixture = TestBed.createComponent(XpertRemoteSelectComponent)

    fixture.componentRef.setInput('url', '/api/connector/select-options?provider=lark')
    fixture.componentRef.setInput('params', {
      workspaceId: 'workspace-1'
    })
    fixture.detectChanges()

    const req = httpMock.expectOne(
      (request) =>
        request.urlWithParams === '/api/connector/select-options?provider=lark&workspaceId=workspace-1'
    )
    expect(req.request.params.get('workspaceId')).toBe('workspace-1')
    req.flush([])
  })
})
