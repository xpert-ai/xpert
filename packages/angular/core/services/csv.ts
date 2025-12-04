export function csvDownload(data: any[], name: string, delimiter: string) {
  const items = data
  const filename = name || `export.csv`
  const d = delimiter || `,`

  const header: string[] = Array.from(new Set(items.reduce((r, e) => [...r, ...Object.keys(e)], [])))
  const csv = items.map((row) =>
    header.map((fieldName: string) => JSON.stringify(row[fieldName] === 0 ? 0 : row[fieldName] || '')).join(d)
  )
  csv.unshift(header.join(d))
  const csvStr = csv.join('\r\n')

  const bom = '\uFEFF'
  const blob = new Blob([bom + csvStr], {
    type: 'text/csv;charset=utf-8'
  })

  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
