jest.mock('echarts/core', () => ({ registerTheme: jest.fn() }))

import { signal } from '@angular/core'
import { fakeAsync, TestBed, tick } from '@angular/core/testing'
import { UsersService } from '@xpert-ai/cloud/state'
import { BehaviorSubject, of } from 'rxjs'
import { ToastrService, XpertAPIService } from '../../../../@core'
import { PACEditUserComponent } from '../edit-user/edit-user.component'
import { UserBasicComponent } from './user-basic.component'

describe('UserBasicComponent', () => {
  it('loads the linked Xpert only for read-only technical user details', fakeAsync(() => {
    const userId$ = new BehaviorSubject('user-1')
    const xpertService = {
      getByPrincipalUser: jest.fn().mockReturnValue(
        of({
          id: 'xpert-1',
          name: 'linked-xpert'
        })
      )
    }

    TestBed.configureTestingModule({
      imports: [UserBasicComponent],
      providers: [
        {
          provide: PACEditUserComponent,
          useValue: {
            userId$,
            user: signal({ id: 'user-1' })
          }
        },
        { provide: UsersService, useValue: {} },
        { provide: XpertAPIService, useValue: xpertService },
        { provide: ToastrService, useValue: {} }
      ]
    }).overrideComponent(UserBasicComponent, {
      set: {
        imports: [],
        template: ''
      }
    })

    const fixture = TestBed.createComponent(UserBasicComponent)
    fixture.detectChanges()
    tick()
    expect(xpertService.getByPrincipalUser).not.toHaveBeenCalled()

    fixture.componentRef.setInput('readOnly', true)
    fixture.componentRef.setInput('showLinkedXpert', true)
    fixture.detectChanges()
    tick()
    expect(xpertService.getByPrincipalUser).toHaveBeenCalledTimes(1)
    expect(xpertService.getByPrincipalUser).toHaveBeenCalledWith('user-1')
    expect(fixture.componentInstance.linkedXpert()).toMatchObject({ id: 'xpert-1' })
  }))
})
