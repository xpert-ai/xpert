export enum SlidesToolEnum {
    GENERATE_SLIDES = 'generate_slides',
}

export type TSlidesCredentials = {
    // Language Model
    copilotModel: {
        copilotId: string;
        model: string;
    };
    // Vision Model
    visionModel: {
        copilotId: string;
        model: string;
    };
    // Embedding Model
    embeddingModel: {
        copilotId: string;
        model: string;
    };
    timeout?: number; // in seconds
}

export enum SlidesToolVariableEnum {
    TEMPLATE_FILE = 'tool_slides_template_file',
}