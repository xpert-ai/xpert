import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { ControlValueAccessor } from '@angular/forms'
import { CodeEditorComponent } from './editor.component'

jest.mock('../../../@core', () => ({
  injectEditorTheme: () => signal('vs')
}))

describe('CodeEditorComponent', () => {
  let fixture: ComponentFixture<CodeEditorComponent>
  let component: CodeEditorComponent

  beforeEach(async () => {
    TestBed.resetTestingModule()
    TestBed.overrideComponent(CodeEditorComponent, {
      set: {
        template: '',
        imports: []
      }
    })

    await TestBed.configureTestingModule({
      imports: [CodeEditorComponent]
    }).compileComponents()

    fixture = TestBed.createComponent(CodeEditorComponent)
    component = fixture.componentInstance
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('forwards editor changes through instance-level value accessor callbacks', () => {
    const valueAccessor = component as Partial<Pick<ControlValueAccessor, 'registerOnChange' | 'writeValue'>>
    const onChange = jest.fn()

    expect(typeof valueAccessor.writeValue).toBe('function')
    expect(typeof valueAccessor.registerOnChange).toBe('function')

    valueAccessor.writeValue?.('{"type":"object"}')
    valueAccessor.registerOnChange?.(onChange)

    expect(component.value$()).toBe('{"type":"object"}')

    component.onEditorChange('{"type":"string"}')

    expect(onChange).toHaveBeenCalledWith('{"type":"string"}')
  })
})
