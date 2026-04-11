/**
 * Why this exists:
 * Shared form changes for `context.model` are easy to regress because the visible behavior only shows up in remote-select params.
 * This test guards the contract that sibling-driven depends resolve from the current model and stay flattened for query serialization.
 */
import { TestBed } from '@angular/core/testing'
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
      imports: [JSONSchemaPropertyComponent]
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
    } as any)
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
})
