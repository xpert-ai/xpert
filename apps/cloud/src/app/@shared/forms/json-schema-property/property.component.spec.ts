/**
 * Why this exists:
 * Shared form changes for `context.model` are easy to regress because the visible behavior only shows up in remote-select params.
 * This test guards the contract that sibling/context-driven depends resolve from the current form context and stay flattened for query serialization.
 */
import { fakeAsync, TestBed, tick } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { JsonSchemaFormOptions } from '../json-schema-form/form-options'
import { JSONSchemaPropertyComponent } from './property.component'

jest.mock('echarts/core', () => ({
  registerTheme: jest.fn()
}))

describe('JSONSchemaPropertyComponent', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule()
    TestBed.overrideComponent(JSONSchemaPropertyComponent, {
      set: {
        template: '',
        imports: []
      }
    })

    await TestBed.configureTestingModule({
      imports: [JSONSchemaPropertyComponent, TranslateModule.forRoot()],
      providers: [JsonSchemaFormOptions]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('resolves depends values from sibling model context first', () => {
    const fixture = TestBed.createComponent(JSONSchemaPropertyComponent)

    fixture.componentRef.setInput('schema', {
      type: 'string',
      'x-ui': {
        depends: [
          {
            name: 'integrationId',
            alias: 'integration'
          }
        ]
      }
    })
    fixture.componentRef.setInput('context', {
      model: {
        integrationId: 'integration-1'
      }
    })
    fixture.detectChanges()

    expect(fixture.componentInstance.depends()).toEqual({
      integration: 'integration-1'
    })
  })

  it('resolves depends values from explicit context source', () => {
    const fixture = TestBed.createComponent(JSONSchemaPropertyComponent)

    fixture.componentRef.setInput('schema', {
      type: 'string',
      'x-ui': {
        depends: [
          {
            source: 'context',
            name: 'workspaceId',
            alias: 'workspace'
          }
        ]
      }
    })
    fixture.componentRef.setInput('context', {
      workspaceId: 'workspace-1',
      model: {
        workspaceId: 'model-workspace'
      }
    })
    fixture.detectChanges()

    expect(fixture.componentInstance.depends()).toEqual({
      workspace: 'workspace-1'
    })
  })

  it('evaluates visibleWhen values from sibling model context', () => {
    const fixture = TestBed.createComponent(JSONSchemaPropertyComponent)

    fixture.componentRef.setInput('schema', {
      type: 'string',
      'x-ui': {
        visibleWhen: {
          name: 'authMode',
          value: 'connector'
        }
      }
    })
    fixture.componentRef.setInput('context', {
      model: {
        authMode: 'user'
      }
    })
    fixture.detectChanges()

    expect(fixture.componentInstance.visible()).toBe(false)

    fixture.componentRef.setInput('context', {
      model: {
        authMode: 'connector'
      }
    })
    fixture.detectChanges()

    expect(fixture.componentInstance.visible()).toBe(true)
  })

  it('merges generic form control defaults with field inputs taking precedence', () => {
    TestBed.inject(JsonSchemaFormOptions).controlDefaults.set({
      boolean: { displayDensity: 'compact' },
      switch: { zSize: 'sm', disabled: true }
    })
    const fixture = TestBed.createComponent(JSONSchemaPropertyComponent)

    fixture.componentRef.setInput('schema', {
      type: 'boolean',
      'x-ui': {
        inputs: {
          zSize: 'lg'
        }
      }
    })
    fixture.detectChanges()

    expect(fixture.componentInstance.controlInputs()).toEqual({
      displayDensity: 'compact',
      zSize: 'lg',
      disabled: true
    })
    expect(fixture.componentInstance.controlInput('missing', 'fallback')).toBe('fallback')
  })

  it('collapses complex object schema fields by default', () => {
    const fixture = TestBed.createComponent(JSONSchemaPropertyComponent)

    fixture.componentRef.setInput('schema', {
      type: 'object',
      properties: {
        mode: {
          type: 'string'
        }
      }
    })
    fixture.detectChanges()

    expect(fixture.componentInstance.collapsibleObject()).toBe(true)
    expect(fixture.componentInstance.objectCollapsed()).toBe(true)

    fixture.componentInstance.toggleObjectCollapsed()

    expect(fixture.componentInstance.objectCollapsed()).toBe(false)
  })

  it('expands array object items by default and exposes an item title', () => {
    const fixture = TestBed.createComponent(JSONSchemaPropertyComponent)

    fixture.componentRef.setInput('schema', {
      type: 'object',
      properties: {
        mode: {
          type: 'string'
        }
      }
    })
    fixture.componentRef.setInput('arrayItem', true)
    fixture.componentRef.setInput('arrayIndex', 2)
    fixture.detectChanges()

    expect(fixture.componentInstance.collapsibleObject()).toBe(true)
    expect(fixture.componentInstance.objectCollapsed()).toBe(false)
    expect(fixture.componentInstance.label()).toBeUndefined()
    expect(fixture.componentInstance.arrayItemTitleParams()).toEqual({
      Default: 'Item 3',
      index: 3
    })
  })

  it('prefers localized x-ui metadata for labels and descriptions', () => {
    const fixture = TestBed.createComponent(JSONSchemaPropertyComponent)

    fixture.componentRef.setInput('schema', {
      type: 'string',
      title: 'Model version',
      description: 'Seedream model version.',
      'x-ui': {
        title: {
          en_US: 'Model',
          zh_Hans: '模型版本'
        },
        description: {
          en_US: 'Select a Seedream model.',
          zh_Hans: '选择 Seedream 模型。'
        }
      }
    })
    fixture.detectChanges()

    expect(fixture.componentInstance.label()).toEqual({
      en_US: 'Model',
      zh_Hans: '模型版本'
    })
    expect(fixture.componentInstance.propertyDescription()).toEqual({
      en_US: 'Select a Seedream model.',
      zh_Hans: '选择 Seedream 模型。'
    })
  })

  it('localizes x-ui enum labels before passing them to select options', () => {
    const fixture = TestBed.createComponent(JSONSchemaPropertyComponent)

    fixture.componentRef.setInput('schema', {
      type: 'boolean',
      enum: [true, false],
      'x-ui': {
        enumLabels: {
          true: {
            en_US: 'Enabled',
            zh_Hans: '启用'
          },
          false: {
            en_US: 'Disabled',
            zh_Hans: '禁用'
          }
        }
      }
    })
    fixture.detectChanges()

    expect(fixture.componentInstance.enumOptions()).toEqual([
      { label: 'Enabled', value: true },
      { label: 'Disabled', value: false }
    ])
  })

  it('applies schema defaults when the current value is nullish', fakeAsync(() => {
    const fixture = TestBed.createComponent(JSONSchemaPropertyComponent)

    fixture.componentRef.setInput('schema', {
      type: 'string',
      default: '2048x2048'
    })
    fixture.detectChanges()
    tick()
    tick()

    expect(fixture.componentInstance.value$()).toBe('2048x2048')
  }))
})

describe('JSONSchemaPropertyComponent control rendering', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [JSONSchemaPropertyComponent, TranslateModule.forRoot()],
      providers: [JsonSchemaFormOptions]
    }).compileComponents()
  })
  afterEach(() => TestBed.resetTestingModule())

  it('adds and removes array items without submitting the containing form', fakeAsync(() => {
    const fixture = TestBed.createComponent(JSONSchemaPropertyComponent)
    const stabilize = () => {
      fixture.detectChanges()
      tick()
      fixture.detectChanges()
      tick()
      fixture.detectChanges()
    }
    fixture.componentRef.setInput('schema', {
      type: 'array',
      title: 'Allowed redirect hosts',
      items: { type: 'string' }
    })
    fixture.componentInstance.value$.set([])
    stabilize()

    const root: HTMLElement = fixture.nativeElement
    const form = document.createElement('form')
    const submit = jest.fn((event: Event) => event.preventDefault())
    form.addEventListener('submit', submit)
    root.parentNode?.insertBefore(form, root)
    form.appendChild(root)
    const save = document.createElement('button')
    save.type = 'submit'
    form.appendChild(save)

    try {
      const add = root.querySelector('button')!
      add.click()
      stabilize()
      expect(root.querySelectorAll('input')).toHaveLength(1)
      expect(submit).not.toHaveBeenCalled()

      const input = root.querySelector('input')!
      input.value = 'be.internal'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      stabilize()
      expect(fixture.componentInstance.value$()).toEqual(['be.internal'])

      add.click()
      stabilize()
      expect(root.querySelectorAll('input')).toHaveLength(2)
      expect(submit).not.toHaveBeenCalled()

      const remove = root.querySelectorAll('z-icon[zType="trash"]')[1].closest('button')!
      remove.click()
      stabilize()
      expect(fixture.componentInstance.value$()).toEqual(['be.internal'])
      expect(submit).not.toHaveBeenCalled()

      save.click()
      expect(submit).toHaveBeenCalledTimes(1)

      fixture.componentRef.setInput('readonly', true)
      fixture.detectChanges()
      expect(add.disabled).toBe(true)
      add.click()
      expect(fixture.componentInstance.value$()).toEqual(['be.internal'])
      expect(submit).toHaveBeenCalledTimes(1)
    } finally {
      form.remove()
    }
  }))

  it('renders a decimal slider, saves keyboard changes and respects bounds and readonly', fakeAsync(() => {
    const fixture = TestBed.createComponent(JSONSchemaPropertyComponent)
    fixture.componentRef.setInput('schema', {
      type: 'number',
      title: 'Minimum OCR confidence',
      default: 0.5,
      minimum: 0,
      maximum: 1,
      'x-ui': { component: 'slider', inputs: { step: 0.01 } }
    })
    fixture.detectChanges()
    tick()
    fixture.detectChanges()
    tick()
    fixture.detectChanges()

    const thumb: HTMLElement = fixture.nativeElement.querySelector('[role="slider"]')
    expect(thumb).not.toBeNull()
    expect(thumb.getAttribute('aria-valuenow')).toBe('0.5')
    expect(fixture.nativeElement.querySelector('input[type="number"]')).toBeNull()

    for (const [key, expected] of [
      ['ArrowRight', 0.51],
      ['Home', 0],
      ['ArrowLeft', 0],
      ['End', 1]
    ] as const) {
      thumb.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }))
      tick()
      fixture.detectChanges()
      expect(fixture.componentInstance.value$()).toBe(expected)
      expect(thumb.getAttribute('aria-valuenow')).toBe(String(expected))
    }

    fixture.componentRef.setInput('readonly', true)
    fixture.detectChanges()
    expect(thumb.getAttribute('aria-disabled')).toBe('true')
    thumb.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }))
    tick()
    fixture.detectChanges()
    expect(fixture.componentInstance.value$()).toBe(1)
  }))

  it('renders checkbox fields inline and preserves false values and readonly state', fakeAsync(() => {
    const fixture = TestBed.createComponent(JSONSchemaPropertyComponent)
    fixture.componentRef.setInput('schema', {
      type: 'boolean',
      title: 'OCR',
      default: true,
      'x-ui': { component: 'checkbox' }
    })
    fixture.detectChanges()
    tick()
    fixture.detectChanges()
    tick()
    fixture.detectChanges()
    const input: HTMLInputElement = fixture.nativeElement.querySelector('z-checkbox input')
    expect(input).not.toBeNull()
    expect(input.checked).toBe(true)
    expect(fixture.nativeElement.querySelector('z-switch')).toBeNull()
    input.click()
    tick()
    fixture.detectChanges()
    expect(input.checked).toBe(false)
    fixture.componentRef.setInput('readonly', true)
    fixture.detectChanges()
    expect(input.disabled).toBe(true)
  }))
})

describe('JSONSchemaPropertyComponent provider schema controls', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JSONSchemaPropertyComponent, TranslateModule.forRoot()],
      providers: [JsonSchemaFormOptions]
    }).compileComponents()
  })

  it('selects an object branch from its declared constant and uses defaults when switching', fakeAsync(() => {
    const fixture = TestBed.createComponent(JSONSchemaPropertyComponent)
    const field = fixture.componentInstance
    fixture.componentRef.setInput('schema', {
      anyOf: [
        {
          type: 'object',
          properties: { format: { type: 'string', const: 'csv' }, headerRow: { type: 'integer', default: 1 } }
        },
        {
          type: 'object',
          properties: {
            format: { type: 'string', const: 'json' },
            rowsPath: { type: 'array', items: { type: 'string' } }
          }
        }
      ]
    })
    field.value$.set({ format: 'json', rowsPath: ['data'] })
    for (let step = 0; step < 4; step++) {
      fixture.detectChanges()
      tick()
    }
    expect(field.variantIndex()).toBe(1)
    expect(field.value$()).toEqual({ format: 'json', rowsPath: ['data'] })
    expect(fixture.nativeElement.querySelector('z-select')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('select')).toBeNull()
    field.selectVariant(0)
    for (let step = 0; step < 4; step++) {
      fixture.detectChanges()
      tick()
    }
    expect(field.value$()).toEqual({ format: 'csv', headerRow: 1 })
    expect(
      fixture.nativeElement.querySelector('json-schema-property z-select [role="combobox"]').textContent
    ).toContain('csv')
    fixture.componentRef.setInput('readonly', true)
    fixture.detectChanges()
    tick()
    fixture.detectChanges()
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="number"]')
    expect(input.disabled).toBe(true)
  }))

  it('keeps boolean and numeric enum values typed when selecting or clearing Zard options', fakeAsync(() => {
    const fixture = TestBed.createComponent(JSONSchemaPropertyComponent)
    const field = fixture.componentInstance
    fixture.componentRef.setInput('schema', { enum: [true, false, 0, 5] })
    field.value$.set(true)
    fixture.detectChanges()
    tick()
    fixture.detectChanges()
    field.updateEnum(1)
    fixture.detectChanges()
    tick()
    expect(field.value$()).toBe(false)
    fixture.detectChanges()
    tick()
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[role="combobox"]').textContent).toContain('false')
    field.updateEnum(2)
    expect(field.value$()).toBe(0)
    field.updateEnum('')
    expect(field.value$()).toBeUndefined()
  }))

  it('reports nested JSON drafts and required fields, and drops optional JSON values when cleared', fakeAsync(() => {
    const fixture = TestBed.createComponent(JSONSchemaPropertyComponent)
    const field = fixture.componentInstance
    fixture.componentRef.setInput('schema', {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
        arguments: { type: 'object', additionalProperties: true }
      }
    })
    field.value$.set({ name: '', arguments: { limit: 0, enabled: false } })
    for (let step = 0; step < 4; step++) {
      fixture.detectChanges()
      tick()
    }
    expect(field.invalid).toBe(true)
    field.updateValue('name', 'Sales')
    for (let step = 0; step < 4; step++) {
      fixture.detectChanges()
      tick()
    }
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea')
    expect(JSON.parse(textarea.value)).toEqual({ limit: 0, enabled: false })
    textarea.value = '{'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    fixture.detectChanges()
    tick()
    fixture.detectChanges()
    expect(field.invalid).toBe(true)
    expect(field.value$().arguments).toEqual({ limit: 0, enabled: false })
    textarea.value = ''
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    for (let step = 0; step < 4; step++) {
      fixture.detectChanges()
      tick()
    }
    expect(field.invalid).toBe(false)
    expect(field.value$()).toEqual({ name: 'Sales' })
  }))
})
