import { Component, DestroyRef, OnInit, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl } from '@angular/forms'
import { Router } from '@angular/router'
import { FieldType } from '@ngx-formly/core'
import { Observable, startWith } from 'rxjs'

const isNonNullable = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined

@Component({
  selector: 'pac-formly-semantic-model',
  standalone: false,
  template: `<ngm-select
    displayDensity="compact"
    [label]="'FORMLY.COMMON.SemanticModel' | translate: { Default: 'Semantic Model' }"
    [selectOptions]="selectOptions()"
    valueKey="key"
    [formControl]="valueControl"
    [panelWidth]="props?.panelWidth"
    [class.ngm-select-error]="notFound()"
  >
    <ng-template ngmOptionContent let-option>
      <div class="flex items-center whitespace-nowrap overflow-hidden">
        <button z-button zType="ghost" zSize="icon" zShape="circle" (click)="openSemanticModel(option.value)">
          <mat-icon>open_in_new</mat-icon>
        </button>

        <div class="flex-1 text-ellipsis overflow-hidden" [title]="option.caption">
          {{ option.caption }}
        </div>
      </div>
    </ng-template>

    <div ngmError>
      @if (notFound()) {
        <span>{{ 'FORMLY.COMMON.NotFoundValue' | translate: {Default: 'Not found value: '} }} {{notFound()}}</span>
      }
    </div>
  </ngm-select>`,
  styles: [
    `
      :host {
        flex: 1;
      }
    `
  ]
})
export class PACFormlySemanticModelComponent extends FieldType implements OnInit {
  private router = inject(Router)
  readonly #destroyRef = inject(DestroyRef)

  get valueControl() {
    return this.formControl as FormControl
  }
  readonly selectOptions = signal<any[] | null>(null)
  readonly value = signal(null)
  readonly notFound = signal<string | null>(null)

  #validatorEffectRef = effect(() => {
    if (isNonNullable(this.value()) && isNonNullable(this.selectOptions()) && !this.selectOptions().find((option) => option.key === this.value())) {
      this.notFound.set(this.value())
    } else {
      this.notFound.set(null)
    }
  }, { allowSignalWrites: true })

  ngOnInit() {
    ;(this.props.options as Observable<any[]>)?.subscribe((options) => {
      this.selectOptions.set(options)
    })

    this.valueControl.valueChanges.pipe(startWith(this.valueControl.value), takeUntilDestroyed(this.#destroyRef)).subscribe((value) => {
      this.value.set(value)
    })
  }

  openSemanticModel(id: string) {
    const url = this.router.serializeUrl(this.router.createUrlTree(['models', id]))
    window.open(url, '_blank')
  }
}
