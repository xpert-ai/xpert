import { IIntegration, TRagWebOptions } from '@metad/contracts'
import { NotionAPILoader } from "@langchain/community/document_loaders/web/notionapi";

export const load = async (webOptions: TRagWebOptions, integration: IIntegration) => {
	// Loading a page (including child pages all as separate documents)
	const loader = new NotionAPILoader({
		clientOptions: {
			auth: integration.options.token,
		},
		id: "<PAGE_ID>",
		type: "page",
	});

	return await loader.load()
}
