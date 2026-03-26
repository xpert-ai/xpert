import { booleanAttribute, Component, computed, input, output } from '@angular/core'
import { CommonModule } from '@angular/common'
import { MatButtonModule } from '@angular/material/button'
import {
  IntegrationAction,
  IntegrationRuntimeView,
  IntegrationTestView,
  IntegrationViewItem,
  IntegrationViewSection
} from '../../../@core'

type IntegrationPanelView = Pick<IntegrationTestView, 'sections'> & Partial<Pick<IntegrationRuntimeView, 'actions'>>

@Component({
  standalone: true,
  selector: 'pac-integration-runtime-panel',
  templateUrl: './runtime-panel.component.html',
  imports: [CommonModule, MatButtonModule]
})
export class RuntimePanelComponent {
  readonly view = input<IntegrationPanelView | null>(null)
  readonly dirty = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly saved = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly loading = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly actionTriggered = output<IntegrationAction>()

  readonly sections = computed(() => this.view()?.sections ?? [])
  readonly actions = computed(() => this.filterActions(this.view()?.actions ?? []))

  filterActions(actions: IntegrationAction[] | undefined | null) {
    return (actions ?? []).filter((action) => !(action.hiddenWhenDirty && this.dirty()))
  }

  visibleSectionActions(section: IntegrationViewSection) {
    return this.filterActions(section.actions)
  }

  toneClasses(tone: IntegrationViewSection['tone']) {
    switch (tone) {
      case 'success':
        return 'border-emerald-200 bg-emerald-50 text-emerald-950'
      case 'warning':
        return 'border-amber-200 bg-amber-50 text-amber-900'
      case 'danger':
        return 'border-rose-200 bg-rose-50 text-rose-950'
      case 'info':
        return 'border-sky-200 bg-sky-50 text-sky-950'
      case 'neutral':
      default:
        return 'border-slate-200 bg-slate-50 text-slate-900'
    }
  }

  labelForItem(item: IntegrationViewItem) {
    return item.label || item.key
  }

  renderItemValue(item: IntegrationViewItem) {
    if (item.type === 'boolean') {
      return item.value ? 'Yes' : 'No'
    }

    if (item.type === 'datetime') {
      if (item.value === null || item.value === undefined || typeof item.value === 'boolean') {
        return '-'
      }
      return new Date(item.value).toLocaleString()
    }

    if (item.value === null || item.value === undefined || item.value === '') {
      return '-'
    }

    return String(item.value)
  }

  resolveColor(action: IntegrationAction) {
    return action.color && action.color !== 'default' ? action.color : undefined
  }

  isActionDisabled(action: IntegrationAction) {
    return this.loading() || (action.requiresSaved && !this.saved())
  }

  triggerAction(action: IntegrationAction) {
    if (this.isActionDisabled(action)) {
      return
    }

    this.actionTriggered.emit(action)
  }
}
