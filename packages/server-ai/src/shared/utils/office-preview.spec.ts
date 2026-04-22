import { parseOfficeAsync } from 'officeparser'
import { extractOfficePreviewText } from './office-preview'

jest.mock('officeparser', () => ({
	parseOfficeAsync: jest.fn()
}))

describe('extractOfficePreviewText', () => {
	afterEach(() => {
		jest.clearAllMocks()
	})

	it('extracts docx preview text with officeparser', async () => {
		;(parseOfficeAsync as jest.Mock).mockResolvedValue('Proposal title\r\n\r\nDetails')

		await expect(extractOfficePreviewText('proposal.docx', Buffer.from('docx'))).resolves.toBe(
			'Proposal title\n\nDetails'
		)
		expect(parseOfficeAsync).toHaveBeenCalledWith(
			expect.any(Buffer),
			expect.objectContaining({
				ignoreNotes: true,
				newlineDelimiter: '\n'
			})
		)
	})

	it('extracts pptx preview text with officeparser', async () => {
		;(parseOfficeAsync as jest.Mock).mockResolvedValue('Slide 1\nOverview')

		await expect(extractOfficePreviewText('deck.pptx', Buffer.from('pptx'))).resolves.toBe('Slide 1\nOverview')
		expect(parseOfficeAsync).toHaveBeenCalledWith(
			expect.any(Buffer),
			expect.objectContaining({
				ignoreNotes: true,
				newlineDelimiter: '\n'
			})
		)
	})

	it('ignores unsupported office files', async () => {
		await expect(extractOfficePreviewText('report.xlsx', Buffer.from('xlsx'))).resolves.toBeUndefined()
	})
})
