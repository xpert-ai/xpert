import { Component } from '@angular/core'
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { ITag, TagCategoryEnum } from '@xpert-ai/contracts'
import { BehaviorSubject } from 'rxjs'
import { TagService } from '../../../@core'
import { TagSelectComponent } from './tag-select.component'

jest.mock('@milkdown/crepe', () => ({
  Crepe: class {
    static Feature = {}
  }
}))

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, TagSelectComponent],
  template: '<tag-select [category]="category" [formControl]="control" />'
})
class HostComponent {
  category = TagCategoryEnum.XPERT
  control = new FormControl<ITag[]>([])
}

describe('TagSelectComponent catalog lifecycle', () => {
  const retained: ITag = { id: 'disabled', name: 'Retained', isActive: false, organizationId: 'org' }
  const organization: ITag = { id: 'organization', name: 'Contract', organizationId: 'org' }
  const shared: ITag = { id: 'shared', name: 'Contract', organizationId: null }
  const catalog = new BehaviorSubject<ITag[]>([])

  beforeEach(async () => {
    catalog.next([retained, organization, shared])
    await TestBed.configureTestingModule({
      imports: [HostComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        {
          provide: TagService,
          useValue: {
            getCatalogByCategory: () => catalog
          }
        }
      ]
    }).compileComponents()
  })
  afterEach(() => TestBed.resetTestingModule())

  function settle(fixture: ComponentFixture<HostComponent>) {
    fixture.detectChanges()
    // NgModel writes checkbox values on the next microtask.
    tick()
    fixture.detectChanges()
  }

  function render(selected: ITag[] = [retained]) {
    const fixture = TestBed.createComponent(HostComponent)
    fixture.componentInstance.control.setValue(selected)
    settle(fixture)
    tick(300)
    settle(fixture)
    return fixture
  }

  it('adds an active tag while retaining an existing disabled tag and marks the form dirty', fakeAsync(() => {
    const fixture = render()
    const option: HTMLElement = fixture.nativeElement.querySelector('[data-option-tag-id] input')
    option.matches('input') ? option.click() : option.querySelector('input').click()
    settle(fixture)
    expect(fixture.componentInstance.control.value.map((tag) => tag.id)).toEqual(['disabled', 'organization'])
    expect(fixture.componentInstance.control.dirty).toBe(true)
  }))

  it('initializes existing active values before the catalog arrives and remains usable after refresh', fakeAsync(() => {
    catalog.next([])
    const fixture = render([organization])
    expect(fixture.componentInstance.control.pristine).toBe(true)
    catalog.next([organization, shared])
    settle(fixture)
    const option: HTMLElement = fixture.nativeElement.querySelector('[data-option-tag-id="shared"]')
    option.matches('input') ? option.click() : option.querySelector('input').click()
    settle(fixture)
    expect(fixture.componentInstance.control.value.map((tag) => tag.id)).toEqual(['organization', 'shared'])
    catalog.next([])
    settle(fixture)
    expect(fixture.componentInstance.control.value).toHaveLength(2)
    catalog.next([organization, shared])
    settle(fixture)
    expect(fixture.nativeElement.querySelectorAll('[data-option-tag-id] input:checked')).toHaveLength(2)
  }))

  it('removes a disabled selection without offering it for selection again', fakeAsync(() => {
    const fixture = render([retained, organization])
    const chip: HTMLElement = fixture.nativeElement.querySelector('[data-selected-tag-id="disabled"]')
    expect(chip.textContent).toContain('XP.TagDirectory.disabled')
    chip.querySelector('button').click()
    settle(fixture)
    expect(fixture.componentInstance.control.value.map((tag) => tag.id)).toEqual(['organization'])
    expect(fixture.nativeElement.querySelector('[data-option-tag-id="disabled"]')).toBeNull()
    expect(fixture.componentInstance.control.dirty).toBe(true)
    expect(fixture.componentInstance.control.touched).toBe(true)
  }))

  it('distinguishes organization/shared names and selects each once by ID', fakeAsync(() => {
    const fixture = render([])
    const org: HTMLElement = fixture.nativeElement.querySelector('[data-option-tag-id="organization"]')
    const tenant: HTMLElement = fixture.nativeElement.querySelector('[data-option-tag-id="shared"]')
    expect(org.textContent).toContain('XP.TagDirectory.Organization')
    expect(tenant.textContent).toContain('XP.TagDirectory.Shared')
    org.querySelector('input').click()
    settle(fixture)
    tenant.querySelector('input').click()
    settle(fixture)
    expect(fixture.componentInstance.control.value.map((tag) => tag.id)).toEqual(['organization', 'shared'])
    tenant.querySelector('input').click()
    settle(fixture)
    expect(fixture.componentInstance.control.value.map((tag) => tag.id)).toEqual(['organization'])
  }))

  it('preserves selections hidden by search while adding or removing a visible option', fakeAsync(() => {
    const another: ITag = { id: 'another', name: 'API' }
    catalog.next([retained, organization, another])
    const fixture = render([retained, organization])
    const selector: TagSelectComponent = fixture.debugElement.query(By.directive(TagSelectComponent)).componentInstance
    selector.searchControl.setValue('API')
    tick(300)
    settle(fixture)
    const option: HTMLElement = fixture.nativeElement.querySelector('[data-option-tag-id="another"]')
    option.matches('input') ? option.click() : option.querySelector('input').click()
    settle(fixture)
    expect(fixture.componentInstance.control.value.map((tag) => tag.id)).toEqual([
      'disabled',
      'organization',
      'another'
    ])
    option.matches('input') ? option.click() : option.querySelector('input').click()
    settle(fixture)
    expect(fixture.componentInstance.control.value.map((tag) => tag.id)).toEqual(['disabled', 'organization'])
    selector.searchControl.setValue('')
    tick(300)
    settle(fixture)
    expect(
      fixture.nativeElement.querySelector('[data-option-tag-id="organization"]').querySelector('input').checked
    ).toBe(true)
  }))

  it('updates disabled status from the catalog without changing the form value', fakeAsync(() => {
    const fixture = render([organization])
    catalog.next([{ ...organization, isActive: false }, shared])
    settle(fixture)
    expect(fixture.nativeElement.querySelector('[data-selected-tag-id="organization"]').textContent).toContain(
      'XP.TagDirectory.disabled'
    )
    expect(fixture.nativeElement.querySelector('[data-option-tag-id="organization"]')).toBeNull()
    expect(fixture.componentInstance.control.pristine).toBe(true)
    expect(fixture.componentInstance.control.value).toEqual([organization])
    catalog.next([organization, shared])
    settle(fixture)
    expect(
      fixture.nativeElement.querySelector('[data-option-tag-id="organization"]').querySelector('input').checked
    ).toBe(true)
    const option: HTMLElement = fixture.nativeElement.querySelector('[data-option-tag-id="shared"]')
    option.matches('input') ? option.click() : option.querySelector('input').click()
    settle(fixture)
    expect(fixture.componentInstance.control.value.map((tag) => tag.id)).toEqual(['organization', 'shared'])
  }))

  it('does not change values in a disabled form control', fakeAsync(() => {
    const fixture = render([retained])
    fixture.componentInstance.control.disable()
    settle(fixture)
    const remove: HTMLButtonElement = fixture.nativeElement.querySelector('[data-selected-tag-id="disabled"] button')
    expect(remove.disabled).toBe(true)
    remove.click()
    const option: HTMLElement = fixture.nativeElement.querySelector('[data-option-tag-id] input')
    option.matches('input') ? option.click() : option.querySelector('input').click()
    settle(fixture)
    expect(fixture.componentInstance.control.value).toEqual([retained])
  }))
})
