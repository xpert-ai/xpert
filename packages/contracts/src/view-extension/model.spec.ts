import { WORKBENCH_FILE_OPEN_COMMAND, type WorkbenchOpenFile } from '../index'

describe('Workbench file open contract', () => {
  it('publishes the stable command key and evidence payload shape', () => {
    const file = {
      name: 'drawing.pdf',
      mimeType: 'application/pdf',
      url: 'https://example.test/drawing.pdf',
      evidence: {
        attributeCode: 'total_height',
        displayValue: '11.5 mm',
        locator: {
          page: 1,
          coordinateSpace: 'normalized_top_left',
          recognitionRotation: 90,
          box: { x: 0.396, y: 0.378, width: 0.016, height: 0.03 }
        }
      }
    } satisfies WorkbenchOpenFile

    expect(WORKBENCH_FILE_OPEN_COMMAND).toBe('workbench.file.open')
    expect(file.evidence.locator.recognitionRotation).toBe(90)
  })
})
