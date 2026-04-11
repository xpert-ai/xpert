import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'

import {
  type ZardChipInputEvent,
  ZardChipGridComponent,
  ZardChipInputDirective,
  ZardChipListboxComponent,
  ZardChipOptionComponent,
  ZardChipRemoveDirective,
  ZardChipRowComponent,
  ZardChipAvatarDirective
} from './chips.component'

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ZardChipListboxComponent, ZardChipOptionComponent],
  template: `
    <z-chip-listbox [formControl]="control">
      <z-chip-option value="github">GitHub</z-chip-option>
      <z-chip-option value="gitlab">GitLab</z-chip-option>
    </z-chip-listbox>
  `
})
class ReactiveListboxHostComponent {
  readonly control = new FormControl('github')
}

@Component({
  standalone: true,
  imports: [FormsModule, ZardChipListboxComponent, ZardChipOptionComponent],
  template: `
    <z-chip-listbox [(ngModel)]="value">
      <z-chip-option value="local">Local</z-chip-option>
      <z-chip-option value="cloud">Cloud</z-chip-option>
    </z-chip-listbox>
  `
})
class NgModelListboxHostComponent {
  value = 'local'
}

@Component({
  standalone: true,
  imports: [ZardChipListboxComponent, ZardChipOptionComponent, ZardChipRemoveDirective],
  template: `
    <z-chip-listbox [selectable]="false">
      <z-chip-option [selected]="selected" removable (removed)="onRemoved()">
        Expression
        <button zChipRemove aria-label="remove">x</button>
      </z-chip-option>
    </z-chip-listbox>
  `
})
class RemovableOptionHostComponent {
  selected = true
  removedCount = 0

  onRemoved() {
    this.removedCount += 1
  }
}

@Component({
  standalone: true,
  imports: [ZardChipGridComponent, ZardChipInputDirective],
  template: `
    <z-chip-grid #grid></z-chip-grid>
    <input
      [zChipInputFor]="grid"
      [zChipInputSeparatorKeyCodes]="separatorKeys"
      [zChipInputAddOnBlur]="addOnBlur"
      (zChipInputTokenEnd)="onToken($event)"
    />
  `
})
class ChipInputHostComponent {
  readonly separatorKeys = [13, 188]
  addOnBlur = false
  event: ZardChipInputEvent | null = null

  onToken(event: ZardChipInputEvent) {
    this.event = event
  }
}

@Component({
  standalone: true,
  imports: [ZardChipRowComponent, ZardChipAvatarDirective, ZardChipRemoveDirective],
  template: `
    <z-chip-row removable (removed)="onRemoved()">
      <span zChipAvatar>AB</span>
      Avatar chip
      <button zChipRemove aria-label="remove">x</button>
    </z-chip-row>
  `
})
class RowSlotHostComponent {
  removedCount = 0

  onRemoved() {
    this.removedCount += 1
  }
}

describe('Zard chips', () => {
  it('syncs single-select listbox with reactive forms', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [ReactiveListboxHostComponent]
    }).createComponent(ReactiveListboxHostComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const options = fixture.nativeElement.querySelectorAll('z-chip-option') as NodeListOf<HTMLElement>
    expect(options[0].dataset.selected).toBe('')
    expect(options[1].dataset.selected).toBeUndefined()

    options[1].click()
    fixture.detectChanges()

    expect(fixture.componentInstance.control.value).toBe('gitlab')
    expect(options[1].dataset.selected).toBe('')
  })

  it('syncs single-select listbox with ngModel', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [NgModelListboxHostComponent]
    }).createComponent(NgModelListboxHostComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const options = fixture.nativeElement.querySelectorAll('z-chip-option') as NodeListOf<HTMLElement>
    options[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    fixture.detectChanges()

    expect(fixture.componentInstance.value).toBe('cloud')
  })

  it('supports controlled selected state and removed output on chip options', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [RemovableOptionHostComponent]
    }).createComponent(RemovableOptionHostComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const option = fixture.nativeElement.querySelector('z-chip-option') as HTMLElement
    const removeButton = fixture.nativeElement.querySelector('[zChipRemove]') as HTMLButtonElement

    expect(option.dataset.selected).toBe('')

    removeButton.click()
    fixture.detectChanges()

    expect(fixture.componentInstance.removedCount).toBe(1)
  })

  it('emits input tokens and clears the input through the chipInput helper', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [ChipInputHostComponent]
    }).createComponent(ChipInputHostComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement
    input.value = 'hello@example.com'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }))
    fixture.detectChanges()

    expect(fixture.componentInstance.event?.value).toBe('hello@example.com')

    fixture.componentInstance.event?.chipInput.clear()
    fixture.detectChanges()

    expect(input.value).toBe('')

    fixture.componentInstance.addOnBlur = true
    fixture.detectChanges()
    input.value = 'blur@example.com'
    input.dispatchEvent(new FocusEvent('blur'))
    fixture.detectChanges()

    expect(fixture.componentInstance.event?.value).toBe('blur@example.com')
  })

  it('renders avatar/remove slots on chip rows and removes through the trailing action', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [RowSlotHostComponent]
    }).createComponent(RowSlotHostComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const avatar = fixture.nativeElement.querySelector('[data-slot="chip-avatar"]') as HTMLElement
    const removeButton = fixture.nativeElement.querySelector('[data-slot="chip-remove"]') as HTMLButtonElement

    expect(avatar).not.toBeNull()
    removeButton.click()
    fixture.detectChanges()

    expect(fixture.componentInstance.removedCount).toBe(1)
  })
})
