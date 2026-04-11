import { IXpertToolset } from "@xpert-ai/contracts"
import { ODataToolset } from './odata-toolset'

describe('OData Toolset for TripPinRESTier', () => {
	let toolset: ODataToolset
	const url = 'https://services.odata.org/TripPinRESTierService/(S(gpti0o5qv3p14bmkguhklnz0))'

	beforeEach(() => {
		toolset = new ODataToolset({
            options: {
                baseUrl: url
            }
        } as IXpertToolset)
	})

	it('should list all entity sets', async () => {
		const toolsSchema = await toolset.getToolsSchema()

		console.log(toolsSchema)

		expect(toolsSchema).toBeDefined()
	})
})
