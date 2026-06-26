/**
 * Why this exists:
 * Shared form changes for `context.model` are easy to regress because the visible behavior only shows up in remote-select params.
 * This test guards the contract that sibling-driven depends resolve from the current model and stay flattened for query serialization.
 */
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { JSONSchemaPropertyComponent } from './property.component'

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
      imports: [JSONSchemaPropertyComponent, TranslateModule.forRoot()]
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
})
