import { NgTemplateOutlet } from '@angular/common'
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  contentChildren,
  Directive,
  effect,
  ElementRef,
  EventEmitter,
  inject,
  input,
  Input,
  numberAttribute,
  Output,
  signal,
  TemplateRef,
  ViewEncapsulation,
  viewChild,
  viewChildren
} from '@angular/core'
import { AbstractControl } from '@angular/forms'

import type { ClassValue } from 'clsx'

import { mergeClasses } from '@/src/lib/utils/merge-classes'
import { ZardIconComponent } from '../icon/icon.component'
import { ZardTooltipImports, type ZardTooltipPositionVariants, type ZardTooltipType } from '../tooltip'
import {
  stepperConnectorVariants,
  stepperContentVariants,
  stepperErrorVariants,
  stepperHeaderVariants,
  stepperIndicatorVariants,
  stepperItemVariants,
  stepperLabelVariants,
  stepperMetaVariants,
  stepperPanelVariants,
  stepperRailVariants,
  stepperTriggerVariants,
  stepperVariants,
  type ZardStepperSizeVariants
} from './stepper.variants'

export type ZardStepperOrientation = 'horizontal' | 'vertical'

export interface ZardStepperSelectionEvent {
  selectedIndex: number
  previouslySelectedIndex: number
  selectedStep: ZardStepComponent
  previouslySelectedStep: ZardStepComponent | null
}

let zardStepId = 0

@Directive({
  selector: 'ng-template[zStepLabel]'
})
export class ZardStepLabelDirective {
  constructor(readonly templateRef: TemplateRef<unknown>) {}
}

@Component({
  selector: 'z-step',
  template: `
    <ng-template>
      <ng-content />
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'step'
  },
  exportAs: 'zStep'
})
export class ZardStepComponent {
  readonly labelTemplate = contentChild(ZardStepLabelDirective)

  private readonly contentTemplateRef = viewChild.required(TemplateRef<unknown>)
  private readonly explicitCompletedState = signal<boolean | null>(null)
  private readonly hasExplicitCompletedState = signal(false)
  private readonly visitedState = signal(false)
  private readonly forwardCompletedState = signal(false)
  private readonly errorVisibleState = signal(false)

  readonly stepId = `z-step-${++zardStepId}`
  readonly headerId = `${this.stepId}-header`
  readonly panelId = `${this.stepId}-panel`

  @Input() label?: string
  @Input() tooltip: ZardTooltipType = null
  @Input() tooltipPosition: ZardTooltipPositionVariants = 'top'
  @Input() stepControl: AbstractControl | null = null
  @Input({ transform: booleanAttribute }) editable = true
  @Input() errorMessage: string | null = null

  @Input('completed')
  set completedInput(value: boolean | null | undefined) {
    if (value === undefined || value === null) {
      this.hasExplicitCompletedState.set(false)
      this.explicitCompletedState.set(null)
      return
    }

    this.hasExplicitCompletedState.set(true)
    this.explicitCompletedState.set(Boolean(value))
  }

  index = -1
  stepper: ZardStepperComponent | null = null

  get contentTemplate(): TemplateRef<unknown> {
    return this.contentTemplateRef()
  }

  get hasExplicitCompleted(): boolean {
    return this.hasExplicitCompletedState()
  }

  get completed(): boolean {
    if (this.hasExplicitCompletedState()) {
      return this.explicitCompletedState() ?? false
    }

    return this.stepper?.isStepCompleted(this) ?? false
  }

  get showError(): boolean {
    return this.errorVisibleState()
  }

  get hasVisited(): boolean {
    return this.visitedState()
  }

  get hasForwardCompleted(): boolean {
    return this.forwardCompletedState()
  }

  markVisited(): void {
    this.visitedState.set(true)
  }

  markForwardCompleted(): void {
    this.forwardCompletedState.set(true)
  }

  revealError(): void {
    this.errorVisibleState.set(true)
  }

  clearError(): void {
    this.errorVisibleState.set(false)
  }

  resetState(): void {
    this.visitedState.set(false)
    this.forwardCompletedState.set(false)
    this.errorVisibleState.set(false)
  }
}

@Directive({
  selector: 'button[zStepperNext], a[zStepperNext], [zStepperNext]',
  host: {
    '(click)': 'handleClick($event)'
  }
})
export class ZardStepperNextDirective {
  private readonly stepper = inject(ZardStepperComponent, { optional: true })
  private readonly step = inject(ZardStepComponent, { optional: true })

  handleClick(event: Event): void {
    if (!(event.currentTarget instanceof HTMLElement) || isDisabled(event.currentTarget)) {
      return
    }

    this.resolveStepper()?.next()
  }

  private resolveStepper(): ZardStepperComponent | null {
    return this.stepper ?? this.step?.stepper ?? null
  }
}

@Directive({
  selector: 'button[zStepperPrevious], a[zStepperPrevious], [zStepperPrevious]',
  host: {
    '(click)': 'handleClick($event)'
  }
})
export class ZardStepperPreviousDirective {
  private readonly stepper = inject(ZardStepperComponent, { optional: true })
  private readonly step = inject(ZardStepComponent, { optional: true })

  handleClick(event: Event): void {
    if (!(event.currentTarget instanceof HTMLElement) || isDisabled(event.currentTarget)) {
      return
    }

    this.resolveStepper()?.previous()
  }

  private resolveStepper(): ZardStepperComponent | null {
    return this.stepper ?? this.step?.stepper ?? null
  }
}

@Component({
  selector: 'z-stepper',
  imports: [NgTemplateOutlet, ZardIconComponent, ...ZardTooltipImports],
  template: `
    <div class="hidden" aria-hidden="true">
      <ng-content />
    </div>

    <div [class]="headerClasses()" role="tablist" [attr.aria-orientation]="orientation">
      @for (step of stepItems(); track step.stepId; let index = $index; let last = $last) {
        <div [class]="itemClasses()">
          <button
            #stepHeader
            type="button"
            [class]="triggerClasses(step, index)"
            [attr.data-size]="zSize()"
            role="tab"
            [id]="step.headerId"
            [attr.aria-controls]="step.panelId"
            [attr.aria-selected]="selectedIndexState() === index"
            [attr.tabindex]="headerTabIndex(index)"
            [attr.data-state]="stepState(step, index)"
            [attr.data-blocked]="isHeaderBlocked(step, index) ? 'true' : null"
            [attr.data-editable]="step.editable ? 'true' : null"
            [zTooltip]="step.tooltip"
            [zPosition]="step.tooltipPosition"
            (click)="onHeaderClick(index)"
            (keydown)="onHeaderKeydown($event, index)"
          >
            <span [class]="railClasses()">
              <span [class]="indicatorClasses(step, index)" [attr.data-size]="zSize()">
                @if (showCompletedIndicator(step, index)) {
                  <z-icon zType="check" class="size-4" aria-hidden="true" />
                } @else {
                  {{ index + 1 }}
                }
              </span>

              @if (!last) {
                <span [class]="connectorClasses(step, index)"></span>
              }
            </span>

            <span [class]="contentClasses()">
              <!-- <span [class]="metaClasses()"> STEP {{ index + 1 }} </span> -->

              @if (step.labelTemplate(); as labelTemplate) {
                <span [class]="labelClasses()">
                  <ng-container [ngTemplateOutlet]="labelTemplate.templateRef" />
                </span>
              } @else {
                <span [class]="labelClasses()">
                  {{ step.label || 'Step ' + (index + 1) }}
                </span>
              }

              @if (shouldShowError(step, index)) {
                <span [class]="errorClasses()">
                  {{ step.errorMessage }}
                </span>
              }
            </span>
          </button>
        </div>
      }
    </div>

    @if (selectedStepInternal(); as step) {
      <div [class]="panelClasses()" role="tabpanel" [id]="step.panelId" [attr.aria-labelledby]="step.headerId">
        <ng-container [ngTemplateOutlet]="step.contentTemplate" />
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '[attr.data-size]': 'zSize()',
    'data-slot': 'stepper'
  },
  exportAs: 'zStepper'
})
export class ZardStepperComponent {
  readonly class = input<ClassValue>('')
  readonly zSize = input<ZardStepperSizeVariants>('default')

  protected readonly stepItems = contentChildren(ZardStepComponent)
  private readonly headerElements = viewChildren<ElementRef<HTMLElement>>('stepHeader')
  protected readonly selectedIndexState = signal(0)
  protected readonly selectedStepInternal = computed<ZardStepComponent | null>(() => {
    const steps = this.stepItems()
    if (!steps.length) {
      return null
    }

    return steps[this.selectedIndexState()] ?? null
  })

  private selectedStepRef: ZardStepComponent | null = null

  @Input({ transform: booleanAttribute }) linear = false
  @Input({ transform: normalizeStepperOrientation }) orientation: ZardStepperOrientation = 'horizontal'

  @Input({ transform: numberAttribute })
  set selectedIndex(value: number) {
    const nextIndex = Number.isFinite(value) ? Math.max(0, value) : 0
    this.applyInputSelectedIndex(nextIndex)
  }

  get selectedIndex(): number {
    return this.selectedIndexState()
  }

  get selectedStep(): ZardStepComponent | null {
    return this.selectedStepInternal()
  }

  get steps(): readonly ZardStepComponent[] {
    return this.stepItems()
  }

  @Output() readonly selectedIndexChange = new EventEmitter<number>()
  @Output() readonly selectionChange = new EventEmitter<ZardStepperSelectionEvent>()

  constructor() {
    effect(() => {
      const steps = this.stepItems()
      if (!steps.length) {
        this.selectedStepRef = null
        this.selectedIndexState.set(0)
        return
      }

      steps.forEach((step, index) => {
        step.index = index
        step.stepper = this
      })

      const currentIndex = this.selectedIndexState()
      const selectedStepRef = this.selectedStepRef

      if (selectedStepRef && steps.includes(selectedStepRef)) {
        const nextIndex = steps.indexOf(selectedStepRef)
        if (nextIndex !== currentIndex) {
          this.selectedIndexState.set(nextIndex)
        }
      } else {
        const nextIndex = clampIndex(currentIndex, steps.length)
        if (nextIndex !== currentIndex) {
          this.selectedIndexState.set(nextIndex)
        }
        this.selectedStepRef = steps[nextIndex] ?? null
      }
    })
  }

  next(): void {
    this.goTo(this.selectedIndexState() + 1)
  }

  previous(): void {
    this.goTo(this.selectedIndexState() - 1)
  }

  goTo(index: number): void {
    this.setSelectedIndex(index, { emit: true, focus: false })
  }

  reset(): void {
    for (const step of this.stepItems()) {
      step.resetState()
    }

    this.setSelectedIndex(0, { emit: true, focus: false, force: true })
  }

  isStepCompleted(step: ZardStepComponent): boolean {
    if (step.stepControl) {
      return step.hasVisited && step.stepControl.valid
    }

    return step.hasForwardCompleted
  }

  protected triggerClasses(step: ZardStepComponent, index: number): string {
    return stepperTriggerVariants({
      orientation: this.orientation,
      zSize: this.zSize(),
      state: this.stepState(step, index),
      blocked: this.isHeaderBlocked(step, index)
    })
  }

  protected indicatorClasses(step: ZardStepComponent, index: number): string {
    return stepperIndicatorVariants({
      zSize: this.zSize(),
      state: this.stepState(step, index)
    })
  }

  protected connectorClasses(step: ZardStepComponent, index: number): string {
    return stepperConnectorVariants({
      orientation: this.orientation,
      zSize: this.zSize(),
      state: this.stepState(step, index)
    })
  }

  protected headerTabIndex(index: number): number {
    return this.selectedIndexState() === index ? 0 : -1
  }

  protected classes(): string {
    return mergeClasses(stepperVariants({ orientation: this.orientation, zSize: this.zSize() }), this.class())
  }

  protected headerClasses(): string {
    return stepperHeaderVariants({ orientation: this.orientation, zSize: this.zSize() })
  }

  protected itemClasses(): string {
    return stepperItemVariants({ orientation: this.orientation })
  }

  protected railClasses(): string {
    return stepperRailVariants({ orientation: this.orientation, zSize: this.zSize() })
  }

  protected contentClasses(): string {
    return stepperContentVariants({ orientation: this.orientation, zSize: this.zSize() })
  }

  protected panelClasses(): string {
    return stepperPanelVariants({ zSize: this.zSize() })
  }

  protected metaClasses(): string {
    return stepperMetaVariants({ zSize: this.zSize() })
  }

  protected labelClasses(): string {
    return stepperLabelVariants({ zSize: this.zSize() })
  }

  protected errorClasses(): string {
    return stepperErrorVariants({ zSize: this.zSize() })
  }

  protected showCompletedIndicator(step: ZardStepComponent, index: number): boolean {
    return this.isStepCompleted(step) && index !== this.selectedIndexState()
  }

  protected shouldShowError(step: ZardStepComponent, index: number): boolean {
    return (
      index === this.selectedIndexState() &&
      step.showError &&
      Boolean(step.errorMessage) &&
      Boolean(step.stepControl?.invalid)
    )
  }

  protected stepState(step: ZardStepComponent, index: number): 'upcoming' | 'active' | 'completed' {
    if (index === this.selectedIndexState()) {
      return 'active'
    }

    if (this.isStepCompleted(step)) {
      return 'completed'
    }

    return 'upcoming'
  }

  protected onHeaderClick(index: number): void {
    this.setSelectedIndex(index, { emit: true, focus: false })
  }

  protected onHeaderKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.setSelectedIndex(index, { emit: true, focus: true })
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      this.focusHeader(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      this.focusHeader(this.stepItems().length - 1)
      return
    }

    const delta = getNavigationDelta(event.key, this.orientation)
    if (delta === null) {
      return
    }

    event.preventDefault()
    this.focusRelativeHeader(index, delta)
  }

  protected isHeaderBlocked(step: ZardStepComponent, index: number): boolean {
    if (index < this.selectedIndexState() && !step.editable && step.completed) {
      return true
    }

    if (!this.linear || index <= this.selectedIndexState()) {
      return false
    }

    return this.getFirstIncompleteIndex(index) !== null
  }

  private setSelectedIndex(index: number, options: { emit: boolean; focus: boolean; force?: boolean }): void {
    const steps = this.stepItems()
    if (!steps.length) {
      this.selectedIndexState.set(0)
      this.selectedStepRef = null
      return
    }

    const targetIndex = clampIndex(index, steps.length)
    const currentIndex = this.selectedIndexState()

    if (!options.force && targetIndex === currentIndex) {
      if (options.focus) {
        this.focusHeader(targetIndex)
      }
      return
    }

    const targetStep = steps[targetIndex]
    const currentStep = steps[currentIndex] ?? null

    if (targetIndex < currentIndex && !targetStep.editable && targetStep.completed) {
      return
    }

    if (this.linear && targetIndex > currentIndex) {
      const firstIncompleteIndex = this.getFirstIncompleteIndex(targetIndex)
      if (firstIncompleteIndex !== null) {
        if (firstIncompleteIndex === currentIndex && currentStep?.stepControl?.invalid) {
          currentStep.revealError()
        }
        return
      }
    }

    for (const step of steps) {
      step.clearError()
    }

    if (currentStep) {
      currentStep.markVisited()
      if (targetIndex > currentIndex) {
        currentStep.markForwardCompleted()
      }
    }

    this.selectedIndexState.set(targetIndex)
    this.selectedStepRef = targetStep

    if (options.emit) {
      this.selectedIndexChange.emit(targetIndex)
      this.selectionChange.emit({
        selectedIndex: targetIndex,
        previouslySelectedIndex: currentIndex,
        selectedStep: targetStep,
        previouslySelectedStep: currentStep
      })
    }

    if (options.focus) {
      this.focusHeader(targetIndex)
    }
  }

  private getFirstIncompleteIndex(targetIndex: number): number | null {
    const steps = this.stepItems()
    const currentIndex = this.selectedIndexState()
    for (let index = 0; index < targetIndex; index++) {
      const step = steps[index]
      if (!step || !this.canAdvancePastStep(step, index === currentIndex)) {
        return index
      }
    }

    return null
  }

  private canAdvancePastStep(step: ZardStepComponent, isCurrentStep: boolean): boolean {
    if (step.completed) {
      return true
    }

    if (step.hasExplicitCompleted) {
      return false
    }

    if (isCurrentStep) {
      if (step.stepControl) {
        return step.stepControl.valid
      }

      return true
    }

    return false
  }

  private applyInputSelectedIndex(index: number): void {
    const steps = this.stepItems()
    const nextIndex = steps.length ? clampIndex(index, steps.length) : index
    this.selectedIndexState.set(nextIndex)
    if (steps.length) {
      this.selectedStepRef = steps[nextIndex] ?? null
    }
  }

  private focusHeader(index: number): void {
    this.headerElements()[index]?.nativeElement.focus()
  }

  private focusRelativeHeader(index: number, delta: number): void {
    const total = this.headerElements().length
    if (!total) {
      return
    }

    const nextIndex = (index + delta + total) % total
    this.focusHeader(nextIndex)
  }
}

function getNavigationDelta(key: string, orientation: ZardStepperOrientation): number | null {
  if (orientation === 'vertical') {
    if (key === 'ArrowDown') {
      return 1
    }
    if (key === 'ArrowUp') {
      return -1
    }
    return null
  }

  if (key === 'ArrowRight') {
    return 1
  }
  if (key === 'ArrowLeft') {
    return -1
  }

  return null
}

function normalizeStepperOrientation(value: unknown): ZardStepperOrientation {
  return value === 'vertical' ? 'vertical' : 'horizontal'
}

function clampIndex(index: number, length: number): number {
  if (!length) {
    return 0
  }

  return Math.min(Math.max(index, 0), length - 1)
}

function isDisabled(element: HTMLElement): boolean {
  return (
    element.hasAttribute('disabled') ||
    element.getAttribute('aria-disabled') === 'true' ||
    element.getAttribute('data-disabled') === 'true'
  )
}
