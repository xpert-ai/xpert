import { SelectionModel } from '@angular/cdk/collections'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, HostBinding, Input, Output } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { map } from 'rxjs/operators'
import { ITag } from '../../../@core'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-tag-viewer',
  templateUrl: './viewer.component.html',
  styleUrls: ['./viewer.component.scss']
})
export class TagViewerComponent {
  @Input() tags: ITag[] = []
  @HostBinding('class.selectable')
  @Input()
  selectable = false

  selection = new SelectionModel<string>(true, [])

  @Output() selectedChange = this.selection.changed.pipe(map((change) => change.source.selected))

  toggleTag(tag: ITag) {
    this.selection.toggle(tag.name)
  }

  isSelected(tag: ITag) {
    return this.selection.isSelected(tag.name)
  }
}
