import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, forwardRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, FormGroup, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ToastrService, XpertToolsetService } from 'apps/cloud/src/app/@core'
import { IXpertToolset } from '@xpert-ai/contracts'
import { Subject } from 'rxjs'
import { XpertConfigureToolComponent } from '../api-tool/types'
jest.mock('../openapi/', () => {
  const { Component } = require('@angular/core')
  class XpertStudioConfigureToolComponent {}
  Component({ standalone: true, selector: 'test-openapi-unused', template: '' })(XpertStudioConfigureToolComponent)
  return { XpertStudioConfigureToolComponent }
})
jest.mock('../odata/', () => {
  const { Component } = require('@angular/core')
  class XpertStudioConfigureODataComponent {}
  Component({ standalone: true, selector: 'test-odata-unused', template: '' })(XpertStudioConfigureODataComponent)
  return { XpertStudioConfigureODataComponent }
})
import { XpertStudioCreateToolComponent } from './create.component'

@Component({
  standalone: true,
  selector: 'test-tool-configure',
  template: '',
  providers: [{ provide: XpertConfigureToolComponent, useExisting: forwardRef(() => ConfigureStub) }]
})
class ConfigureStub extends XpertConfigureToolComponent {
  formGroup = new FormGroup({ name: new FormControl('Tool', Validators.required) })
  isValid() {
    return this.formGroup.valid
  }
  isDirty() {
    return this.formGroup.dirty
  }
}

describe('XpertStudioCreateToolComponent submission', () => {
  const create = jest.fn()
  const close = jest.fn()
  const toastr = { success: jest.fn(), error: jest.fn() }
  beforeEach(async () => {
    jest.clearAllMocks()
    await TestBed.configureTestingModule({
      imports: [XpertStudioCreateToolComponent, TranslateModule.forRoot()],
      providers: [
        { provide: DIALOG_DATA, useValue: { workspace: { id: 'workspace-1' }, type: 'openapi' } },
        { provide: DialogRef, useValue: { close } },
        { provide: XpertToolsetService, useValue: { create } },
        { provide: ToastrService, useValue: toastr }
      ]
    })
      .overrideComponent(XpertStudioCreateToolComponent, {
        set: {
          imports: [ConfigureStub],
          template: '<test-tool-configure #configure />'
        }
      })
      .compileComponents()
  })

  it('rejects invalid forms and duplicate submissions, then restores controls after a failure', () => {
    const fixture = TestBed.createComponent(XpertStudioCreateToolComponent)
    fixture.detectChanges()
    const component = fixture.componentInstance
    const form = component.configure().formGroup
    const response = new Subject<IXpertToolset>()
    create.mockReturnValue(response)
    form.controls.name.setValue('')
    component.createTool()
    expect(create).not.toHaveBeenCalled()
    form.controls.name.setValue('Tool')
    component.toolset.set({ name: 'Tool' } as IXpertToolset)
    component.createTool()
    component.createTool()
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({ name: 'Tool', workspaceId: 'workspace-1' })
    expect(component.loading()).toBe(true)
    response.error(new Error('Save failed'))
    expect(component.loading()).toBe(false)
    expect(close).not.toHaveBeenCalled()
    expect(toastr.error).toHaveBeenCalled()
  })

  it('returns the created toolset through the dialog result', () => {
    const fixture = TestBed.createComponent(XpertStudioCreateToolComponent)
    fixture.detectChanges()
    const response = new Subject<IXpertToolset>()
    create.mockReturnValue(response)
    fixture.componentInstance.toolset.set({ name: 'Tool' } as IXpertToolset)
    fixture.componentInstance.createTool()
    const result = { id: 'tool-1', name: 'Tool' } as IXpertToolset
    response.next(result)
    expect(close).toHaveBeenCalledWith(result)
    expect(fixture.componentInstance.loading()).toBe(false)
  })
})
