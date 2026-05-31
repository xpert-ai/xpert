import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { KnowledgebaseService, ToastrService, XpertAPIService } from '../../../../@core'
import { XpertNewKnowledgeComponent } from './new.component'

describe('XpertNewKnowledgeComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('keeps an empty initial name invalid after selecting an embedding model', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DIALOG_DATA,
          useValue: {
            workspaceId: 'workspace-1'
          }
        },
        {
          provide: DialogRef,
          useValue: {
            close: jest.fn()
          }
        },
        {
          provide: XpertAPIService,
          useValue: {}
        },
        {
          provide: ToastrService,
          useValue: {
            success: jest.fn(),
            error: jest.fn()
          }
        },
        {
          provide: KnowledgebaseService,
          useValue: {
            create: jest.fn()
          }
        }
      ]
    })

    const component = TestBed.runInInjectionContext(() => new XpertNewKnowledgeComponent())

    component.copilotModel.set({} as never)

    expect(() => component.invalid()).not.toThrow()
    expect(component.invalid()).toBe(true)
  })
})
