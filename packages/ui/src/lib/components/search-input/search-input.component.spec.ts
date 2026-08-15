import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormsModule } from '@angular/forms'

import { ZardSearchInputComponent } from './search-input.component'

@Component({
  imports: [FormsModule, ZardSearchInputComponent],
  template: `<z-search-input [(ngModel)]="value" placeholder="Search plugins" clearLabel="Clear plugin search" />`
})
class SearchInputHostComponent {
  value = 'installed'
}

describe('ZardSearchInputComponent', () => {
  it('renders the search affordance and participates in Angular forms', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [SearchInputHostComponent]
    }).createComponent(SearchInputHostComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement

    expect(fixture.nativeElement.querySelector('z-icon')).not.toBeNull()
    expect(input.placeholder).toBe('Search plugins')
    expect(input.value).toBe('installed')

    input.value = 'marketplace'
    input.dispatchEvent(new Event('input'))
    fixture.detectChanges()

    expect(fixture.componentInstance.value).toBe('marketplace')

    const clearButton = fixture.nativeElement.querySelector(
      'button[aria-label="Clear plugin search"]'
    ) as HTMLButtonElement
    clearButton.click()
    fixture.detectChanges()

    expect(fixture.componentInstance.value).toBe('')
    expect(input.value).toBe('')
  })
})
