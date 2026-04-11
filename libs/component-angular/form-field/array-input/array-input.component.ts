import { FocusMonitor } from '@angular/cdk/a11y'
import { BooleanInput, coerceBooleanProperty } from '@angular/cdk/coercion'
import { Component, ElementRef, Input, OnDestroy, Optional, Self, ViewChild } from '@angular/core'
import {
  AbstractControl,
  ControlValueAccessor,
  NgControl,
  UntypedFormArray,
  UntypedFormBuilder,
} from '@angular/forms'
import { isArray, isEmpty } from 'lodash-es'
import { Subject } from 'rxjs'

/** Array input rendered as a plain control value accessor. */
@Component({
  selector: 'pac-array-input',
  standalone: false,
  templateUrl: 'array-input.component.html',
  styleUrls: ['array-input.component.scss'],
  host: {
    '[class.example-floating]': 'shouldLabelFloat',
    '[id]': 'id'
  }
})
export class ArrayInputComponent implements ControlValueAccessor, OnDestroy {
  static nextId = 0
  @ViewChild('area') areaInput: HTMLInputElement
  @ViewChild('exchange') exchangeInput: HTMLInputElement
  @ViewChild('subscriber') subscriberInput: HTMLInputElement

//   parts: FormGroup
  formArray: UntypedFormArray
  stateChanges = new Subject<void>()
  focused = false
  touched = false
  controlType = 'example-tel-input'
  id = `example-tel-input-${ArrayInputComponent.nextId++}`
  onChange = (_: any) => {}
  onTouched = () => {}

  get empty() {
    return isEmpty(this.value)
  }

  get shouldLabelFloat() {
    return this.focused || !this.empty
  }

  @Input('aria-describedby') userAriaDescribedBy: string

  @Input()
  get placeholder(): string {
    return this._placeholder
  }
  set placeholder(value: string) {
    this._placeholder = value
    this.stateChanges.next()
  }
  private _placeholder: string

  @Input()
  get required(): boolean {
    return this._required
  }
  set required(value: BooleanInput) {
    this._required = coerceBooleanProperty(value)
    this.stateChanges.next()
  }
  private _required = false

  @Input()
  get disabled(): boolean {
    return this._disabled
  }
  set disabled(value: BooleanInput) {
    this._disabled = coerceBooleanProperty(value)
    this._disabled ? this.formArray.disable() : this.formArray.enable()
    this.stateChanges.next()
  }
  private _disabled = false

  @Input()
  get size(): number {
    return this._size
  }
  set size(value: number) {
    this._size = value
    this.stateChanges.next()
  }
  private _size = 10

  @Input()
  get length(): number {
    return this._length
  }
  set length(value: number) {
    this._length = value
    this.resize()
    this.stateChanges.next()
  }
  private _length = 1

  @Input()
  get value(): string[] | null {
    // if (this.parts.valid) {
    //   const {
    //     value: { area, exchange, subscriber }
    //   } = this.parts
    //   return []
    // }
    // return null
    return this.formArray.value
  }
  set value(value: string[] | null) {
    if (isArray(value)) {
        this.formArray.patchValue(value)
    }
    this.stateChanges.next()
  }

  get errorState(): boolean {
    return this.formArray.invalid && this.touched
  }

  constructor(
    private formBuilder: UntypedFormBuilder,
    private _focusMonitor: FocusMonitor,
    private _elementRef: ElementRef<HTMLElement>,
    @Optional() @Self() public ngControl: NgControl
  ) {
    this.formArray = formBuilder.array([])

    if (this.ngControl != null) {
      this.ngControl.valueAccessor = this
    }
  }

  ngOnDestroy() {
    this.stateChanges.complete()
    this._focusMonitor.stopMonitoring(this._elementRef)
  }

  resize() {
    const l = this.value.length
    if (this.length > l) {
      for (let index = 0; index < this.length - l; index++) {
        this.formArray.push(this.formBuilder.control(''))
      }
    } else if (this.length < l) {
      for (let index = l; index > this.length; index--) {
        this.formArray.removeAt(index - 1)
      }
    }
  }

  onFocusIn(event: FocusEvent) {
    if (!this.focused) {
      this.focused = true
      this.stateChanges.next()
    }
  }

  onFocusOut(event: FocusEvent) {
    if (!this._elementRef.nativeElement.contains(event.relatedTarget as Element)) {
      this.touched = true
      this.focused = false
      this.onTouched()
      this.stateChanges.next()
    }
  }

  autoFocusNext(control: AbstractControl, nextElement?: HTMLInputElement): void {
    if (!control.errors && nextElement) {
      this._focusMonitor.focusVia(nextElement, 'program')
    }
  }

  autoFocusPrev(control: AbstractControl, prevElement?: HTMLInputElement): void {
    if (control.value.length < 1) {
      this._focusMonitor.focusVia(prevElement, 'program')
    }
  }

  setDescribedByIds(ids: string[]) {
    const controlElement = this._elementRef.nativeElement.querySelector('.example-tel-input-container')!
    controlElement.setAttribute('aria-describedby', ids.join(' '))
  }

  onContainerClick() {
    // if (this.parts.controls.subscriber.valid) {
    //   this._focusMonitor.focusVia(this.subscriberInput, 'program')
    // } else if (this.parts.controls.exchange.valid) {
    //   this._focusMonitor.focusVia(this.subscriberInput, 'program')
    // } else if (this.parts.controls.area.valid) {
    //   this._focusMonitor.focusVia(this.exchangeInput, 'program')
    // } else {
    //   this._focusMonitor.focusVia(this.areaInput, 'program')
    // }
  }

  writeValue(tel: string[] | null): void {
    this.value = tel
  }

  registerOnChange(fn: any): void {
    this.onChange = fn
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled
  }

  _handleInput(control: AbstractControl, nextElement?: HTMLInputElement): void {
    this.autoFocusNext(control, nextElement)
    this.onChange(this.value)
  }
}
