export enum ChatDashboardMessageType {
    /**
     * Display data preview using analytical card event
     */
    AnalyticalCard = 'AnalyticalCard',
    /**
     * Create or edit a cube event
     */
    Cube = 'Cube',
    /**
     * Edit a virtual cube event
     */
    VirtualCube = 'VirtualCube',
    /**
     * Create or edit members (calculated members or dimension sets) event
     */
    Members = 'Members',
    /**
     * List indicators event
     */
    ListIndicators = 'ListIndicators',
    /**
     * Create or edit an indicator event
     */
    Indicator = 'Indicator',

    Indicators = 'Indicators',
}

export enum BIInterruptMessageType {
    SwitchProject = 'switch_project',
    SwitchSemanticModel = 'switch_semantic_model',
    DeleteArtifact = 'delete_artifact',
}

export type TMessageContentCube = {
    type: ChatDashboardMessageType.Cube,
    data: {
        modelId: string
        cubeName: string
    }
}

export type TMessageContentVirtualCube = {
    type: ChatDashboardMessageType.VirtualCube,
    data: {
        modelId: string
        cubeName: string
    }
}

export type TMessageContentMembers = {
    type: ChatDashboardMessageType.Members,
    data: {
        modelId: string
        cubeName: string
        members: {
            __id__: string
            name: string
            label?: string
            caption?: string
            description?: string
            formula: string
            formatting?: {
                unit?: string;
                decimal?: number;
            }
        }[]
    }
}

export type TMessageContentIndicator = {
    type: ChatDashboardMessageType.Indicator,
    data: {
        modelId?: string
        cubeName?: string
        indicatorId: string
    }
}