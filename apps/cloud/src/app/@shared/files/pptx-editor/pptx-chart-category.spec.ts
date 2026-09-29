import JSZip from 'jszip'
import { renderPptxChart } from './pptx-chart.utils'

describe('PptxGenJS native chart categories', () => {
  it.each(['barChart', 'lineChart', 'pieChart'])('renders %s with indexed multi-level cache labels', async (type) => {
    const zip = new JSZip()
    zip.file(
      'ppt/charts/chart1.xml',
      `
      <c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart><c:plotArea><c:${type}><c:barDir val="col"/><c:ser>
          <c:cat><c:multiLvlStrRef><c:f>Sheet1!$A$2:$A$4</c:f><c:multiLvlStrCache>
            <c:ptCount val="3"/><c:lvl>
              <c:pt idx="2"><c:v>Q3</c:v></c:pt><c:pt idx="0"><c:v>Q1</c:v></c:pt>
              <c:pt idx="1"><c:v>Q2</c:v></c:pt>
            </c:lvl><c:lvl><c:pt idx="0"><c:v>Year</c:v></c:pt></c:lvl>
          </c:multiLvlStrCache></c:multiLvlStrRef></c:cat>
          <c:val><c:numRef><c:numCache>
            <c:pt idx="0"><c:v>20</c:v></c:pt><c:pt idx="1"><c:v>35</c:v></c:pt>
            <c:pt idx="2"><c:v>50</c:v></c:pt>
          </c:numCache></c:numRef></c:val>
        </c:ser></c:${type}><c:valAx><c:scaling/></c:valAx></c:plotArea></c:chart>
      </c:chartSpace>`
    )
    const result = await renderPptxChart(zip, 'ppt/charts/chart1.xml')
    expect(result).toMatch(/^data:image\/svg\+xml;base64,/)
    const svg = Buffer.from(result!.split(',')[1], 'base64').toString('utf8')
    if (type !== 'pieChart') {
      expect(svg.indexOf('>Q1</text>')).toBeLessThan(svg.indexOf('>Q2</text>'))
      expect(svg.indexOf('>Q2</text>')).toBeLessThan(svg.indexOf('>Q3</text>'))
      expect(svg).toContain('>Q1</text>')
      expect(svg).toContain('>Q3</text>')
    } else {
      expect(svg.match(/<path /g)?.length).toBe(3)
    }
    expect(svg).not.toContain('>Year</text>')
  })
})
