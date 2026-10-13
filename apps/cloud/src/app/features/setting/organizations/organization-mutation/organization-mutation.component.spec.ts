import { DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import { OrganizationMutationComponent } from './organization-mutation.component'

describe('OrganizationMutationComponent', () => {
  const close = jest.fn()

  beforeEach(async () => {
    close.mockReset()
    await TestBed.configureTestingModule({
      imports: [OrganizationMutationComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [{ provide: DialogRef, useValue: { close } }]
    }).compileComponents()
  })

  it('submits all defaults after editing only the name', () => {
    const fixture = TestBed.createComponent(OrganizationMutationComponent)
    fixture.detectChanges()
    fixture.componentInstance.stepForm().form.controls.name.setValue('New organization')
    fixture.componentInstance.onApply()
    expect(close).toHaveBeenCalledWith({
      name: 'New organization',
      currency: 'CNY',
      defaultValueDateType: 'TODAY',
      invitesAllowed: true,
      inviteExpiryPeriod: 7
    })
  })

  it('blocks empty required fields and invalid invitation expiry', () => {
    const fixture = TestBed.createComponent(OrganizationMutationComponent)
    fixture.detectChanges()
    const component = fixture.componentInstance
    component.onApply()
    expect(close).not.toHaveBeenCalled()
    const form = component.stepForm().form
    form.patchValue({ name: 'Organization', inviteExpiryPeriod: 0 })
    component.onApply()
    expect(close).not.toHaveBeenCalled()
    form.controls.inviteExpiryPeriod.setValue(1)
    component.onApply()
    expect(close).toHaveBeenCalledTimes(1)
  })
})
