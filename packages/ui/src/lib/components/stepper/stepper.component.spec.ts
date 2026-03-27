import { Component, signal } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'

import { ZardStepComponent, ZardStepperComponent, ZardStepperSelectionEvent } from './stepper.component'
import type { ZardStepperSizeVariants } from './stepper.variants'
import { ZardStepperImports } from './stepper.imports'

@Component({
  imports: [ReactiveFormsModule, ...ZardStepperImports],
  template: `
    <z-stepper
      [linear]="linear"
      [orientation]="orientation"
      [selectedIndex]="selectedIndex"
      [zSize]="zSize"
      (selectedIndexChange)="selectedIndexChanges.push($event)"
      (selectionChange)="selectionChanges.push($event)"
      #stepper="zStepper"
    >
      <z-step
        label="Account"
        tooltip="Account details"
        [stepControl]="accountForm"
        errorMessage="Account is required"
        #firstStep="zStep"
      >
        <form [formGroup]="accountForm">
          <input formControlName="name" />
          <button type="button" zStepperNext>Next</button>
        </form>
      </z-step>

      @if (showDetails()) {
        <z-step [editable]="detailsEditable" #detailsStep="zStep">
          <ng-template zStepLabel>Details</ng-template>
          <div>Step Two</div>
          <button type="button" zStepperPrevious>Back</button>
          <button type="button" zStepperNext>Next</button>
        </z-step>
      }

      <z-step label="Review" [completed]="reviewCompleted" #reviewStep="zStep">
        <div>Review</div>
      </z-step>
    </z-stepper>
  `
})
class StepperHostComponent {
  linear = true
  orientation: 'horizontal' | 'vertical' | undefined = undefined
  selectedIndex = 0
  zSize: ZardStepperSizeVariants = 'default'
  detailsEditable = true
  reviewCompleted: boolean | undefined = undefined
  readonly showDetails = signal(true)
  readonly accountForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  })
  readonly selectedIndexChanges: number[] = []
  readonly selectionChanges: ZardStepperSelectionEvent[] = []
}

describe('ZardStepperComponent', () => {
  async function createHost() {
    const fixture = await TestBed.configureTestingModule({
      imports: [StepperHostComponent]
    }).createComponent(StepperHostComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const stepper = fixture.debugElement.query(By.directive(ZardStepperComponent))
      .componentInstance as ZardStepperComponent
    const steps = fixture.debugElement
      .queryAll(By.directive(ZardStepComponent))
      .map((debugElement) => debugElement.componentInstance as ZardStepComponent)

    return { fixture, stepper, steps }
  }

  it('renders horizontal and vertical tablist orientations', async () => {
    const { fixture } = await createHost()
    const tablist = fixture.nativeElement.querySelector('[role="tablist"]') as HTMLElement
    expect(tablist.getAttribute('aria-orientation')).toBe('horizontal')
    expect(tablist.textContent).toContain('STEP 1')
    expect(tablist.textContent).not.toContain('Pending')

    fixture.componentInstance.orientation = 'vertical'
    fixture.detectChanges()

    expect(tablist.getAttribute('aria-orientation')).toBe('vertical')
    const buttons = fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLButtonElement>
    expect(buttons.length).toBe(3)
    expect(buttons[0].getAttribute('aria-selected')).toBe('true')
  })

  it('supports compact size variants', async () => {
    const { fixture } = await createHost()
    fixture.componentInstance.zSize = 'sm'
    fixture.detectChanges()

    const host = fixture.nativeElement.querySelector('[data-slot="stepper"]') as HTMLElement
    const indicator = fixture.nativeElement.querySelector('.z-stepper__indicator') as HTMLElement

    expect(host.getAttribute('data-size')).toBe('sm')
    expect(indicator.className).toContain('size-9')
  })

  it('syncs selectedIndex input and emits selectedIndexChange and selectionChange on interaction', async () => {
    const { fixture, stepper } = await createHost()
    fixture.componentInstance.accountForm.patchValue({ name: 'Ada' })
    fixture.detectChanges()

    stepper.next()
    fixture.detectChanges()

    expect(stepper.selectedIndex).toBe(1)
    expect(fixture.componentInstance.selectedIndexChanges).toEqual([1])
    expect(fixture.componentInstance.selectionChanges[0]).toMatchObject({
      selectedIndex: 1,
      previouslySelectedIndex: 0
    })

    fixture.componentInstance.selectedIndex = 2
    fixture.detectChanges()

    expect(stepper.selectedIndex).toBe(2)
    expect(fixture.componentInstance.selectedIndexChanges).toEqual([1])
  })

  it('supports next, previous and directive-based navigation', async () => {
    const { fixture, stepper } = await createHost()
    fixture.componentInstance.accountForm.patchValue({ name: 'Ada' })
    fixture.detectChanges()

    const nextButton = fixture.nativeElement.querySelector('[zStepperNext]') as HTMLButtonElement
    nextButton.click()
    fixture.detectChanges()
    expect(stepper.selectedIndex).toBe(1)

    const backButton = fixture.nativeElement.querySelector('[zStepperPrevious]') as HTMLButtonElement
    backButton.click()
    fixture.detectChanges()
    expect(stepper.selectedIndex).toBe(0)

    stepper.goTo(1)
    fixture.detectChanges()
    expect(stepper.selectedIndex).toBe(1)

    stepper.previous()
    fixture.detectChanges()
    expect(stepper.selectedIndex).toBe(0)
  })

  it('blocks linear forward navigation when the current step is invalid and shows the step error', async () => {
    const { fixture, stepper } = await createHost()
    stepper.next()
    fixture.detectChanges()

    expect(stepper.selectedIndex).toBe(0)
    const error = fixture.nativeElement.querySelector('.text-destructive') as HTMLElement
    expect(error?.textContent?.trim()).toBe('Account is required')
    expect(fixture.componentInstance.selectionChanges.length).toBe(0)
  })

  it('prevents returning to non-editable completed steps from the header', async () => {
    const { fixture, stepper, steps } = await createHost()
    fixture.componentInstance.accountForm.patchValue({ name: 'Ada' })
    fixture.detectChanges()

    stepper.next()
    fixture.detectChanges()
    steps[1].markForwardCompleted()
    fixture.componentInstance.detailsEditable = false
    fixture.detectChanges()

    stepper.goTo(2)
    fixture.detectChanges()
    expect(stepper.selectedIndex).toBe(2)

    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLButtonElement>
    tabs[1].click()
    fixture.detectChanges()

    expect(stepper.selectedIndex).toBe(2)
  })

  it('derives completion from explicit values, valid controls and forward navigation', async () => {
    const { fixture, stepper, steps } = await createHost()
    expect(steps[0].completed).toBe(false)
    expect(steps[1].completed).toBe(false)

    fixture.componentInstance.accountForm.patchValue({ name: 'Ada' })
    fixture.detectChanges()
    stepper.next()
    fixture.detectChanges()

    expect(steps[0].completed).toBe(true)
    expect(steps[1].completed).toBe(false)

    stepper.next()
    fixture.detectChanges()
    expect(steps[1].completed).toBe(true)

    fixture.componentInstance.reviewCompleted = false
    fixture.detectChanges()
    expect(steps[2].completed).toBe(false)

    fixture.componentInstance.reviewCompleted = true
    fixture.detectChanges()
    expect(steps[2].completed).toBe(true)
  })

  it('preserves selection by step instance when inserting or removing steps', async () => {
    const { fixture, stepper } = await createHost()
    fixture.componentInstance.accountForm.patchValue({ name: 'Ada' })
    fixture.detectChanges()

    stepper.next()
    fixture.detectChanges()
    expect(stepper.selectedStep?.labelTemplate()?.templateRef).toBeDefined()

    fixture.componentInstance.showDetails.set(false)
    fixture.detectChanges()

    expect(stepper.selectedIndex).toBe(1)
    expect(stepper.selectedStep?.label).toBe('Review')
  })
})
