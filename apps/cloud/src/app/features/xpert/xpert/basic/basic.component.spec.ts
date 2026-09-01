import { DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { signal } from '@angular/core'
import { ToastrService, XpertAPIService, XpertTypeEnum } from 'apps/cloud/src/app/@core'

jest.mock('../xpert.component', () => ({ XpertComponent: class XpertComponent {} }))
jest.mock('apps/cloud/src/app/@shared/copilot', () => ({ CopilotModelSelectComponent: class {} }))

import { XpertComponent } from '../xpert.component'
import { XpertService } from '../xpert.service'
import { XpertBasicComponent } from './basic.component'

describe('XpertBasicComponent workspace data scope', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it.each([
    ['user', 'user'],
    ['shared', 'shared'],
    [undefined, 'shared']
  ] as const)('shows %s as the immutable %s scope', (workspaceDataScope, expectedScope) => {
    const xpert = signal({
      id: 'xpert-1',
      type: XpertTypeEnum.Agent,
      workspaceDataScope,
      draft: { team: {} }
    })

    TestBed.configureTestingModule({
      providers: [
        { provide: DialogRef, useValue: {} },
        { provide: ToastrService, useValue: {} },
        { provide: XpertAPIService, useValue: {} },
        { provide: XpertComponent, useValue: {} },
        { provide: XpertService, useValue: { paramId: signal('xpert-1'), xpert } }
      ]
    })

    const component = TestBed.runInInjectionContext(() => new XpertBasicComponent())

    expect(component.workspaceDataScope()).toBe(expectedScope)
  })
})
