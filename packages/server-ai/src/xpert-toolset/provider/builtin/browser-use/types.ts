import { ICopilotModel } from "@metad/contracts"

export enum BrowserUseToolEnum {
    TASK = 'browser_use_task',
    NAVIGATE = 'browser_use_navigate',
    CLICK = 'browser_use_click',
}

export type TBrowserUseToolCredentials = {
    copilotModel: ICopilotModel
}