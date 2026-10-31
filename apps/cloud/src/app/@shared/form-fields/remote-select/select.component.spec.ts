import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
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
      (request) => request.urlWithParams === '/api/connector/select-options?provider=lark&workspaceId=workspace-1'
    )
    expect(req.request.params.get('workspaceId')).toBe('workspace-1')
    req.flush([])
  })

  it('retains a revoked selection as disabled and restores it after access returns', async () => {
    const fixture = TestBed.createComponent(XpertRemoteSelectComponent)
    const control = fixture.debugElement.injector.get(NgxControlValueAccessor)
    fixture.componentRef.setInput('url', '/api/wecom/integration-select-options?usage=invoke')
    control.writeValue('shared-integration')
    fixture.detectChanges()

    const option = { value: 'shared-integration', label: 'Shared WeCom' }
    httpMock.expectOne('/api/wecom/integration-select-options?usage=invoke').flush([option])
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.componentInstance.selectedOptions()).toEqual([option])

    fixture.componentInstance.refresh()
    fixture.detectChanges()
    httpMock.expectOne('/api/wecom/integration-select-options?usage=invoke').flush([])
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.componentInstance.values()).toEqual(['shared-integration'])
    expect(fixture.componentInstance.selectedOptions()).toEqual([
      expect.objectContaining({ value: 'shared-integration', disabled: true })
    ])

    fixture.componentInstance.refresh()
    fixture.detectChanges()
    httpMock.expectOne('/api/wecom/integration-select-options?usage=invoke').flush([option])
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.componentInstance.selectedOptions()).toEqual([option])
    expect(fixture.componentInstance.values()).toEqual(['shared-integration'])
  })
})
