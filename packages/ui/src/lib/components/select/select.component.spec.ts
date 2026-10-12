import { OverlayContainer } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import { Component, signal, type WritableSignal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, ReactiveFormsModule } from '@angular/forms'

import { provideUiI18nAdapter } from '../../core/i18n/ui-i18n.service'
import { ZardSelectItemComponent } from './select-item.component'
import { ZardSelectComponent, type ZardSelectValue } from './select.component'

function dispatchPointerDown(element: Element) {
  if (typeof PointerEvent !== 'function') {
    return
  }

  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }))
}

function dispatchMouseDown(element: Element) {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true })
  element.dispatchEvent(event)
  return event
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ZardSelectComponent, ZardSelectItemComponent],
  template: `
    <z-select [formControl]="control" zPlaceholder="Select a role">
      <z-select-item zValue="SUPER_ADMIN">SUPER_ADMIN</z-select-item>
      <z-select-item zValue="ADMIN">ADMIN</z-select-item>
      <z-select-item zValue="VIEWER">VIEWER</z-select-item>
    </z-select>
  `
})
class TestHostComponent {
  readonly control = new FormControl<string | null>(null)
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ZardSelectComponent, ZardSelectItemComponent],
  template: `
    <z-select [formControl]="control">
      <z-select-item zValue="ADMIN">ADMIN</z-select-item>
    </z-select>
  `
})
class DefaultPlaceholderHostComponent {
  readonly control = new FormControl<string | null>(null)
}

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ZardSelectComponent, ZardSelectItemComponent],
  template: `
    <z-select [formControl]="control" zPlaceholder="Select a role">
      @for (option of options; track option.value) {
        <z-select-item [zValue]="option.value">{{ option.label }}</z-select-item>
      }
    </z-select>
  `
})
class AsyncOptionsHostComponent {
  readonly control = new FormControl<string | null>(null)
  options: Array<{ value: string; label: string }> = []
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ZardSelectComponent, ZardSelectItemComponent],
  template: `
    <z-select [formControl]="control" [zMultiple]="true" [zMaxLabelCount]="1" zPlaceholder="Select roles">
      <z-select-item zValue="SUPER_ADMIN">SUPER_ADMIN</z-select-item>
      <z-select-item zValue="ADMIN">ADMIN</z-select-item>
      <z-select-item zValue="VIEWER">VIEWER</z-select-item>
    </z-select>
  `
})
class MultiSelectHostComponent {
  readonly control = new FormControl<Array<string>>(['SUPER_ADMIN', 'ADMIN'], { nonNullable: true })
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ZardSelectComponent, ZardSelectItemComponent],
  template: `
    <z-select [formControl]="control" [zMultiple]="true" zPlaceholder="Select roles">
      <z-select-item zValue="ADMIN">ADMIN</z-select-item>
      <z-select-item zValue="VIEWER">VIEWER</z-select-item>
    </z-select>
  `
})
class LegacyScalarMultiSelectHostComponent {
  readonly control = new FormControl<ZardSelectValue | ZardSelectValue[]>('ADMIN', { nonNullable: true })
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ZardSelectComponent, ZardSelectItemComponent],
  template: `
    <z-select
      [formControl]="control"
      [zMultiple]="multiple()"
      [zClearable]="clearable()"
      [zDisabled]="disabled()"
      [zSearchable]="true"
      zPlaceholder="All keywords"
      (zSelectionChange)="selectionChanges.push($event)"
    >
      <z-select-item zValue="DashScope">DashScope</z-select-item>
      <z-select-item zValue="model">model</z-select-item>
      <z-select-item [zValue]="0">Zero</z-select-item>
    </z-select>
  `
})
class ClearableSelectHostComponent {
  readonly control = new FormControl<ZardSelectValue | ZardSelectValue[]>(['DashScope', 'model'], { nonNullable: true })
  readonly multiple = signal(true)
  readonly clearable = signal(true)
  readonly disabled = signal(false)
  readonly selectionChanges: Array<ZardSelectValue | ZardSelectValue[]> = []
}

function createI18nProvider(language: WritableSignal<string>) {
  return provideUiI18nAdapter({
    language,
    translate: (key, options) => {
      const count = Number(options?.count ?? 0)
      const locale = options?.lng ?? language()

      if (key === 'xp-ui:select.placeholder') {
        return locale.startsWith('zh') ? '请选择一个选项...' : 'Select an option...'
      }

      if (key === 'xp-ui:select.moreItemsSelected') {
        if (locale.startsWith('zh')) {
          return `还有 ${count} 项已选择`
        }

        return `${count} more item${count === 1 ? '' : 's'} selected`
      }

      return String(options?.defaultValue ?? options?.Default ?? key)
    }
  })
}

describe('ZardSelectComponent', () => {
  it('clears all selected values, notifies the form and restores focus without opening the dropdown', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [ClearableSelectHostComponent]
    }).createComponent(ClearableSelectHostComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    const trigger = fixture.nativeElement.querySelector('button[role="combobox"]') as HTMLButtonElement
    const clearButton = fixture.nativeElement.querySelector('button[aria-label="Clear selection"]') as HTMLButtonElement
    expect(trigger.contains(clearButton)).toBe(false)
    clearButton.focus()
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    clearButton.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(false)
    clearButton.click()
    fixture.detectChanges()
    await fixture.whenStable()

    expect(fixture.componentInstance.control.value).toEqual([])
    expect(fixture.componentInstance.control.touched).toBe(true)
    expect(fixture.componentInstance.selectionChanges).toEqual([[]])
    expect(trigger.textContent).toContain('All keywords')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
    expect(fixture.nativeElement.querySelector('button[aria-label="Clear selection"]')).toBeNull()
  })

  it('closes an open dropdown and resets its search when clearing', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [ClearableSelectHostComponent]
    }).createComponent(ClearableSelectHostComponent)
    const overlayContainer = TestBed.inject(OverlayContainer)
    fixture.detectChanges()
    await fixture.whenStable()

    const trigger = fixture.nativeElement.querySelector('button[role="combobox"]') as HTMLButtonElement
    trigger.click()
    fixture.detectChanges()
    await fixture.whenStable()
    const input = overlayContainer.getContainerElement().querySelector('input') as HTMLInputElement
    input.value = 'DashScope'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    fixture.detectChanges()

    const clearButton = fixture.nativeElement.querySelector('button[aria-label="Clear selection"]') as HTMLButtonElement
    clearButton.click()
    fixture.detectChanges()
    await fixture.whenStable()
    expect(overlayContainer.getContainerElement().querySelector('[role="listbox"]')).toBeNull()

    trigger.click()
    fixture.detectChanges()
    await fixture.whenStable()
    expect((overlayContainer.getContainerElement().querySelector('input') as HTMLInputElement).value).toBe('')
    expect(fixture.componentInstance.control.value).toEqual([])
  })

  it('allows clearing a numeric zero in single-select mode', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [ClearableSelectHostComponent]
    }).createComponent(ClearableSelectHostComponent)
    fixture.componentInstance.multiple.set(false)
    fixture.componentInstance.control.setValue(0)
    fixture.detectChanges()
    await fixture.whenStable()

    const clearButton = fixture.nativeElement.querySelector('button[aria-label="Clear selection"]') as HTMLButtonElement
    clearButton.click()
    fixture.detectChanges()
    await fixture.whenStable()

    expect(fixture.componentInstance.control.value).toBe('')
    expect(fixture.componentInstance.selectionChanges).toEqual([''])
    expect(fixture.nativeElement.querySelector('button[role="combobox"]').textContent).toContain('All keywords')
  })

  it.each(['disabled', 'not clearable'])('hides the clear button when the select is %s', async (state) => {
    const fixture = TestBed.configureTestingModule({
      imports: [ClearableSelectHostComponent]
    }).createComponent(ClearableSelectHostComponent)
    fixture.componentInstance.disabled.set(state === 'disabled')
    fixture.componentInstance.clearable.set(state !== 'not clearable')
    fixture.detectChanges()
    await fixture.whenStable()

    expect(fixture.nativeElement.querySelector('button[aria-label="Clear selection"]')).toBeNull()
    expect(fixture.componentInstance.control.value).toEqual(['DashScope', 'model'])
  })

  it('localizes the default placeholder when the language changes', async () => {
    const language = signal('en-US')
    const fixture = TestBed.configureTestingModule({
      imports: [DefaultPlaceholderHostComponent],
      providers: [createI18nProvider(language)]
    }).createComponent(DefaultPlaceholderHostComponent)

    fixture.detectChanges()
    await fixture.whenStable()

    let trigger = fixture.nativeElement.querySelector('z-select button[role="combobox"]') as HTMLButtonElement
    expect(trigger.textContent).toContain('Select an option...')

    language.set('zh-Hans')
    fixture.detectChanges()
    await fixture.whenStable()

    trigger = fixture.nativeElement.querySelector('z-select button[role="combobox"]') as HTMLButtonElement
    expect(trigger.textContent).toContain('请选择一个选项...')
  })

  it('keeps an explicitly provided placeholder unchanged', async () => {
    const language = signal('zh-Hans')
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [createI18nProvider(language)]
    }).createComponent(TestHostComponent)

    fixture.detectChanges()
    await fixture.whenStable()

    const trigger = fixture.nativeElement.querySelector('z-select button[role="combobox"]') as HTMLButtonElement
    expect(trigger.textContent).toContain('Select a role')
    expect(trigger.textContent).not.toContain('请选择一个选项...')
  })

  it('selects an option from the overlay after pointer and mouse down events', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostComponent]
    }).createComponent(TestHostComponent)
    const overlayContainer = TestBed.inject(OverlayContainer)

    fixture.detectChanges()

    const trigger = fixture.nativeElement.querySelector('z-select button[role="combobox"]') as HTMLButtonElement
    trigger.click()
    fixture.detectChanges()
    await fixture.whenStable()

    const options = overlayContainer.getContainerElement().querySelectorAll('z-select-item')
    const adminOption = options[1] as HTMLElement

    dispatchPointerDown(adminOption)
    const mouseDownEvent = dispatchMouseDown(adminOption)
    adminOption.click()

    fixture.detectChanges()
    await fixture.whenStable()

    expect(mouseDownEvent.defaultPrevented).toBe(true)
    expect(fixture.componentInstance.control.value).toBe('ADMIN')
    expect(trigger.textContent).toContain('ADMIN')
  })

  it('selects an option when items are rendered after initialization', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [AsyncOptionsHostComponent]
    }).createComponent(AsyncOptionsHostComponent)
    const overlayContainer = TestBed.inject(OverlayContainer)

    fixture.detectChanges()

    fixture.componentInstance.options = [
      { value: 'SUPER_ADMIN', label: 'SUPER_ADMIN' },
      { value: 'ADMIN', label: 'ADMIN' },
      { value: 'VIEWER', label: 'VIEWER' }
    ]
    fixture.detectChanges()
    await fixture.whenStable()

    const trigger = fixture.nativeElement.querySelector('z-select button[role="combobox"]') as HTMLButtonElement
    trigger.click()
    fixture.detectChanges()
    await fixture.whenStable()

    const options = overlayContainer.getContainerElement().querySelectorAll('z-select-item')
    const adminOption = options[1] as HTMLElement

    dispatchPointerDown(adminOption)
    const mouseDownEvent = dispatchMouseDown(adminOption)
    adminOption.click()

    fixture.detectChanges()
    await fixture.whenStable()

    expect(mouseDownEvent.defaultPrevented).toBe(true)
    expect(fixture.componentInstance.control.value).toBe('ADMIN')
    expect(trigger.textContent).toContain('ADMIN')
  })

  it('localizes the multiselect overflow summary', async () => {
    const language = signal('en-US')
    const fixture = TestBed.configureTestingModule({
      imports: [MultiSelectHostComponent],
      providers: [createI18nProvider(language)]
    }).createComponent(MultiSelectHostComponent)

    fixture.detectChanges()
    await fixture.whenStable()

    let trigger = fixture.nativeElement.querySelector('z-select button[role="combobox"]') as HTMLButtonElement
    expect(trigger.textContent).toContain('SUPER_ADMIN')
    expect(trigger.textContent).toContain('1 more item selected')

    language.set('zh-Hans')
    fixture.detectChanges()
    await fixture.whenStable()

    trigger = fixture.nativeElement.querySelector('z-select button[role="combobox"]') as HTMLButtonElement
    expect(trigger.textContent).toContain('还有 1 项已选择')
  })

  it('writes the complete selection to a reactive form in multiple mode', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [MultiSelectHostComponent]
    }).createComponent(MultiSelectHostComponent)
    const overlayContainer = TestBed.inject(OverlayContainer)

    fixture.detectChanges()

    const trigger = fixture.nativeElement.querySelector('z-select button[role="combobox"]') as HTMLButtonElement
    trigger.click()
    fixture.detectChanges()
    await fixture.whenStable()

    const options = overlayContainer.getContainerElement().querySelectorAll('z-select-item')
    const viewerOption = options[2] as HTMLElement

    dispatchPointerDown(viewerOption)
    dispatchMouseDown(viewerOption)
    viewerOption.click()

    fixture.detectChanges()
    await fixture.whenStable()

    expect(fixture.componentInstance.control.value).toEqual(['SUPER_ADMIN', 'ADMIN', 'VIEWER'])
  })

  it('normalizes a scalar form value before adding another selection in multiple mode', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [LegacyScalarMultiSelectHostComponent]
    }).createComponent(LegacyScalarMultiSelectHostComponent)
    const overlayContainer = TestBed.inject(OverlayContainer)

    fixture.detectChanges()

    const trigger = fixture.nativeElement.querySelector('z-select button[role="combobox"]') as HTMLButtonElement
    trigger.click()
    fixture.detectChanges()
    await fixture.whenStable()

    const options = overlayContainer.getContainerElement().querySelectorAll('z-select-item')
    const viewerOption = options[1] as HTMLElement

    dispatchPointerDown(viewerOption)
    dispatchMouseDown(viewerOption)
    viewerOption.click()

    fixture.detectChanges()
    await fixture.whenStable()

    expect(fixture.componentInstance.control.value).toEqual(['ADMIN', 'VIEWER'])
  })
})
