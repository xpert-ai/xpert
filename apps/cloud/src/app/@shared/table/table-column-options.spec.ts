import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { NgmTableComponent, TreeTableModule } from '@xpert-ai/ocap-angular/common'

@Component({
  standalone: true,
  imports: [NgmTableComponent],
  template: `
    <ngm-table
      [columns]="columns"
      [data]="data"
    />
  `
})
class TableHostComponent {
  readonly columns = [
    {
      name: 'title',
      caption: 'Title',
      width: '320px',
      minWidth: '160px',
      maxWidth: '240px',
      headerClass: 'header-class',
      cellClass: 'cell-class',
      contentClass: 'content-class'
    }
  ]

  readonly data = [{ title: 'Quarterly forecast' }]
}

@Component({
  standalone: true,
  imports: [NgmTableComponent],
  template: `
    <ngm-table
      [columns]="columns"
      [data]="data"
    />
  `
})
class ResizableTableHostComponent {
  readonly columns = [
    {
      name: 'title',
      caption: 'Title',
      width: '320px',
      minWidth: '160px'
    }
  ]

  readonly data = [{ title: 'Quarterly forecast' }]
}

@Component({
  standalone: true,
  imports: [NgmTableComponent],
  template: `
    <ngm-table
      [columns]="columns"
      [data]="data"
    />
  `
})
class DefaultWidthTableHostComponent {
  readonly columns = [
    {
      name: 'title',
      caption: 'Title'
    },
    {
      name: 'owner',
      caption: 'Owner'
    },
    {
      name: 'status',
      caption: 'Status'
    }
  ]

  readonly data = [
    {
      title: 'Quarterly forecast',
      owner: 'Ops',
      status: 'Active'
    }
  ]
}

@Component({
  standalone: true,
  imports: [TreeTableModule],
  template: `
    <ngm-tree-table
      [columns]="columns"
      [data]="data"
      nameLabel="Name"
    />
  `
})
class TreeTableHostComponent {
  readonly columns = [
    {
      name: 'title',
      caption: 'Title',
      width: '280px',
      minWidth: '140px',
      maxWidth: '220px',
      headerClass: 'header-class',
      cellClass: 'cell-class',
      contentClass: 'content-class'
    }
  ]

  readonly data = [
    {
      key: 'node-1',
      name: 'node-1',
      caption: 'Node 1',
      raw: {
        title: 'Quarterly forecast'
      },
      children: []
    }
  ]
}

describe('table column options', () => {
  it('applies sizing and custom classes to ngm-table columns', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), TableHostComponent]
    }).createComponent(TableHostComponent)

    fixture.detectChanges()

    const nativeElement = fixture.nativeElement as HTMLElement
    const header = nativeElement.querySelector('th[z-table-head]') as HTMLElement
    const cell = nativeElement.querySelector('td[z-table-cell]') as HTMLElement
    const content = cell.querySelector('div') as HTMLElement

    expect(header.style.width).toBe('320px')
    expect(header.style.minWidth).toBe('160px')
    expect(header.style.maxWidth).toBe('240px')
    expect(header.classList.contains('header-class')).toBe(true)

    expect(cell.style.width).toBe('320px')
    expect(cell.style.minWidth).toBe('160px')
    expect(cell.style.maxWidth).toBe('240px')
    expect(cell.classList.contains('cell-class')).toBe(true)

    expect(content.style.maxWidth).toBe('240px')
    expect(content.classList.contains('content-class')).toBe(true)
    expect(content.title).toBe('Quarterly forecast')
    expect(content.textContent?.trim()).toBe('Quarterly forecast')
  })

  it('resizes ngm-table columns from the header handle', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ResizableTableHostComponent]
    }).createComponent(ResizableTableHostComponent)

    fixture.detectChanges()

    const nativeElement = fixture.nativeElement as HTMLElement
    const table = nativeElement.querySelector('table[z-table]') as HTMLElement
    const header = nativeElement.querySelector('th[z-table-head]') as HTMLElement
    const cell = nativeElement.querySelector('td[z-table-cell]') as HTMLElement
    const resizeHandle = header.querySelector('[data-ngm-table-resize-handle]') as HTMLElement

    expect(table.classList.contains('table-fixed')).toBe(true)
    expect(resizeHandle.classList.contains('cursor-col-resize')).toBe(true)
    expect(resizeHandle.classList.contains('absolute')).toBe(true)

    header.getBoundingClientRect = () =>
      ({
        width: 320
      }) as DOMRect

    resizeHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 320 }))
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 380 }))
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    fixture.detectChanges()

    expect(header.style.width).toBe('380px')
    expect(cell.style.width).toBe('380px')
  })

  it('lets manual resize exceed the configured maxWidth', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), TableHostComponent]
    }).createComponent(TableHostComponent)

    fixture.detectChanges()

    const nativeElement = fixture.nativeElement as HTMLElement
    const header = nativeElement.querySelector('th[z-table-head]') as HTMLElement
    const cell = nativeElement.querySelector('td[z-table-cell]') as HTMLElement
    const content = cell.querySelector('div') as HTMLElement
    const resizeHandle = header.querySelector('[data-ngm-table-resize-handle]') as HTMLElement

    expect(header.style.maxWidth).toBe('240px')
    expect(cell.style.maxWidth).toBe('240px')
    expect(content.style.maxWidth).toBe('240px')

    header.getBoundingClientRect = () =>
      ({
        width: 240
      }) as DOMRect

    resizeHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 240 }))
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 380 }))
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    fixture.detectChanges()

    expect(header.style.width).toBe('380px')
    expect(cell.style.width).toBe('380px')
    expect(header.style.maxWidth).toBe('')
    expect(cell.style.maxWidth).toBe('')
    expect(content.style.maxWidth).toBe('')
  })

  it('shows the search button only on header hover or when the column search is active', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), TableHostComponent]
    }).createComponent(TableHostComponent)

    fixture.detectChanges()

    const nativeElement = fixture.nativeElement as HTMLElement
    const header = nativeElement.querySelector('th[z-table-head]') as HTMLElement
    const searchButton = header.querySelector('button[z-button]') as HTMLButtonElement

    expect(searchButton.className).toContain('opacity-0')
    expect(searchButton.className).toContain('pointer-events-none')
    expect(searchButton.className).toContain('group-hover:opacity-60')

    searchButton.click()
    fixture.detectChanges()

    expect(searchButton.className).toContain('opacity-100')
    expect(searchButton.className).toContain('pointer-events-auto')
    expect(header.querySelector('input')).not.toBeNull()
  })

  it('assigns default column widths and exposes horizontal overflow room', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), DefaultWidthTableHostComponent]
    }).createComponent(DefaultWidthTableHostComponent)

    fixture.detectChanges()

    const nativeElement = fixture.nativeElement as HTMLElement
    const table = nativeElement.querySelector('table[z-table]') as HTMLElement
    const headers = Array.from(nativeElement.querySelectorAll('th[z-table-head]')) as HTMLElement[]

    expect(table.style.minWidth).toBe('480px')
    expect(headers.map((header) => header.style.width)).toEqual(['160px', '160px', '160px'])
  })

  it('applies sizing and custom classes to ngm-tree-table columns', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [TreeTableHostComponent]
    }).createComponent(TreeTableHostComponent)

    fixture.detectChanges()

    const nativeElement = fixture.nativeElement as HTMLElement
    const header = nativeElement.querySelectorAll('th[z-table-head]')[1] as HTMLElement
    const cell = nativeElement.querySelectorAll('td[z-table-cell]')[1] as HTMLElement
    const content = cell.querySelector('div') as HTMLElement

    expect(header.style.width).toBe('280px')
    expect(header.style.minWidth).toBe('140px')
    expect(header.style.maxWidth).toBe('220px')
    expect(header.classList.contains('header-class')).toBe(true)

    expect(cell.style.width).toBe('280px')
    expect(cell.style.minWidth).toBe('140px')
    expect(cell.style.maxWidth).toBe('220px')
    expect(cell.classList.contains('cell-class')).toBe(true)

    expect(content.style.maxWidth).toBe('220px')
    expect(content.classList.contains('content-class')).toBe(true)
    expect(content.title).toBe('Quarterly forecast')
    expect(content.textContent?.trim()).toBe('Quarterly forecast')
  })
})
