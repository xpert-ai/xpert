import { Component, Input, OnInit } from '@angular/core'
import { IgxGridComponent } from 'igniteui-angular'

@Component({
  standalone: false,
  selector: 'smart-grid-search-bar',
  templateUrl: './search-bar.component.html',
  styleUrls: ['./search-bar.component.scss'],
})
export class SmartGridSearchBarComponent implements OnInit {
  @Input() grid: IgxGridComponent

  public searchText: string = ''
  public caseSensitive: boolean = false
  public exactMatch: boolean = false
  constructor() {}

  ngOnInit(): void {}

  public clearSearch() {
    this.searchText = "";
    this.grid.clearSearch();
  }

  public searchKeyDown(ev) {
    if (ev.key === 'Enter' || ev.key === 'ArrowDown' || ev.key === 'ArrowRight') {
      ev.preventDefault()
      this.grid.findNext(this.searchText, this.caseSensitive, this.exactMatch)
    } else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') {
      ev.preventDefault()
      this.grid.findPrev(this.searchText, this.caseSensitive, this.exactMatch)
    }
  }

  public updateSearch() {
    this.caseSensitive = !this.caseSensitive
    this.grid.findNext(this.searchText, this.caseSensitive, this.exactMatch)
  }

  public updateExactSearch() {
    this.exactMatch = !this.exactMatch
    this.grid.findNext(this.searchText, this.caseSensitive, this.exactMatch)
  }
}
