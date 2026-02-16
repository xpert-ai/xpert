import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostBinding,
  HostListener,
  Input,
  OnInit,
  Optional,
  SkipSelf
} from '@angular/core'
import { ID } from '@metad/story/core'
import { v4 as uuid } from 'uuid'
import { ResponsiveService } from '../responsive.service'
import { FlexItemType, FlexLayout } from '../types'

@Component({
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-flex-layout',
  templateUrl: 'flex-layout.component.html',
  styles: [
    `
      :host {
        display: flex;
      }
    `
  ]
})
export class NxFlexLayoutComponent implements OnInit {
  FLEX_ITEM_TYPE = FlexItemType

  @HostBinding('class.editable')
  @Input()
  editable: boolean
  @Input() flexLayout: FlexLayout

  @HostBinding('class.active')
  active: boolean
  rightSide: boolean
  activeId: ID
  get parentDirection() {
    return this._parent?.flexLayout.direction
  }
  constructor(
    private responsiveService: ResponsiveService,
    private _elRef: ElementRef,
    @SkipSelf()
    @Optional()
    private _parent?: NxFlexLayoutComponent
  ) {}

  ngOnInit() {
    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry: any) => {
        if (entry.target.offsetWidth + entry.target.offsetLeft > entry.target.offsetParent?.offsetWidth - 50) {
          this.rightSide = true
        } else {
          this.rightSide = false
        }
      })
    })
    observer.observe(this._elRef.nativeElement)

    this.responsiveService.selected$.subscribe((value) => {
      this.activeId = value
      if (value !== this.flexLayout.key) {
        this.active = false
      }
    })
  }

  trackById(index: number, item: FlexLayout) {
    return item.key
  }

  addLaneRight() {
    this._parent.addRight(this.flexLayout.key)
  }

  addLaneLeft() {
    this._parent.addLeft(this.flexLayout.key)
  }

  addRight(key: ID) {
    if (this.flexLayout.direction === 'column') {
      this.addOnRow(key, 1)
    } else {
      this.add(key, 1)
    }
  }

  addLeft(key: ID) {
    if (this.flexLayout.direction === 'column') {
      this.addOnRow(key)
    } else {
      this.add(key)
    }
  }

  addOnRow(key: ID, delta = 0) {
    const index = this.flexLayout.children.findIndex((item) => item.key === key)
    const self = this.flexLayout.children[index]
    this.flexLayout.children[index] = {
      key: uuid(),
      type: 0,
      direction: 'row',
      styles: {
        'flex-direction': 'row',
        'max-width': '100%'
      },
      children: [self]
    }

    this.flexLayout.children[index].children.splice(delta, 0, {
      key: uuid(),
      type: 0,
      styles: {
        // flex: 1,
        'flex-direction': 'row',
        'max-width': '100%'
      }
    })

    this.responsiveService.changeFlexLayout(this.flexLayout)
    // this.responsiveService.changeFlexLayout(this.flexLayout.children[index])
  }

  add(key: ID, delta = 0) {
    const index = this.flexLayout.children.findIndex((item) => item.key === key)
    this.flexLayout.children.splice(index + delta, 0, {
      key: uuid(),
      type: 0,
      styles: {
        // flex: 1,
        'flex-direction': 'row',
        'max-width': '100%'
      }
    })
    this.responsiveService.changeFlexLayout(this.flexLayout)
  }

  addLaneAbove() {
    this._parent.addAbove(this.flexLayout.key)
  }

  addLaneBelow() {
    this._parent.addBelow(this.flexLayout.key)
  }

  addAbove(key: ID) {
    if (this.flexLayout.direction === 'row') {
      this._parent?.addAbove(this.flexLayout.key)
    } else {
      this.add(key)
    }
  }

  addBelow(key: ID) {
    if (this.flexLayout.direction === 'row') {
      this._parent?.addBelow(this.flexLayout.key)
    } else {
      this.add(key, 1)
    }
  }

  removeMyself() {
    this._parent.remove(this.flexLayout.key)
  }

  remove(key: ID) {
    const index = this.flexLayout.children.findIndex((item) => item.key === key)
    this.flexLayout.children.splice(index, 1)
    this.responsiveService.changeFlexLayout(this.flexLayout)
  }

  swapWithPrev() {
    this._parent?.swap(this.flexLayout.key)
  }

  swapWithNext() {
    this._parent?.swap(this.flexLayout.key, 1)
  }

  swap(key: ID, delta = -1) {
    const index = this.flexLayout.children.findIndex((item) => item.key === key)
    const self = this.flexLayout.children[index]
    if (this.flexLayout.children[index + delta]) {
      this.flexLayout.children[index] = this.flexLayout.children[index + delta]
      this.flexLayout.children[index + delta] = self
    }

    this.responsiveService.changeFlexLayout(this.flexLayout)
  }

  @HostListener('click', ['$event'])
  myClick(event) {
    if (this.editable) {
      event.stopPropagation()
      this.active = !this.active
      this.responsiveService.toggle(this.flexLayout.key)
    }
  }

  onChildClick(event, item: FlexLayout) {
    if (this.editable) {
      event.stopPropagation()
      event.preventDefault()
      this.responsiveService.active(item.key)
    }
  }

  @HostBinding('style') get styles() {
    return this.flexLayout.styles
  }
  @HostBinding('style.flex-direction') get flexDirection() {
    return this.flexLayout.direction
  }
  @HostBinding('style.flex-wrap') get flexWrap() {
    return this.flexLayout.wrap ? 'wrap' : 'nowrap'
  }

  @HostBinding('class.ngm-flex-layout') nxFlexLayout = 'ngm-flex-layout'
}
