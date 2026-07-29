jest.mock('echarts/core', () => ({ registerTheme: jest.fn() }))

import { signal } from '@angular/core'
import { fakeAsync, TestBed, tick } from '@angular/core/testing'
import { UsersService } from '@cloud/app/@core/state'
import { BehaviorSubject, of } from 'rxjs'
import { ToastrService, XpertAPIService } from '../../../../@core'
import { XpEditUserComponent } from '../edit-user/edit-user.component'
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
          provide: XpEditUserComponent,
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

  it('uses the latest loaded user id when the editable form model loses its id', async () => {
    const firstUserId = '123e4567-e89b-42d3-a456-426614174000'
    const latestUserId = '223e4567-e89b-42d3-a456-426614174000'
    const userId$ = new BehaviorSubject(firstUserId)
    const currentUser = signal({
      id: firstUserId,
      email: 'first@example.com',
      username: 'first@example.com'
    })
    const update = jest.fn().mockRejectedValue(new Error('stop after update request'))
    const danger = jest.fn()

    TestBed.configureTestingModule({
      imports: [UserBasicComponent],
      providers: [
        {
          provide: XpEditUserComponent,
          useValue: {
            userId$,
            user: currentUser
          }
        },
        { provide: UsersService, useValue: { update } },
        { provide: XpertAPIService, useValue: { getByPrincipalUser: jest.fn() } },
        { provide: ToastrService, useValue: { danger } }
      ]
    }).overrideComponent(UserBasicComponent, {
      set: {
        imports: [],
        template: ''
      }
    })

    const fixture = TestBed.createComponent(UserBasicComponent)
    fixture.detectChanges()

    userId$.next(latestUserId)
    currentUser.set({
      id: latestUserId,
      email: 'latest@example.com',
      username: 'latest@example.com'
    })
    fixture.detectChanges()

    const editableUser = { ...fixture.componentInstance.user }
    Reflect.deleteProperty(editableUser, 'id')
    Reflect.set(fixture.componentInstance, 'user', editableUser)

    await fixture.componentInstance.save()

    expect(update).toHaveBeenCalledWith(
      latestUserId,
      expect.objectContaining({
        email: 'latest@example.com',
        username: 'latest@example.com'
      })
    )
    expect(danger).toHaveBeenCalled()
  })
})
