import { SetMetadata } from '@nestjs/common';

import { MetadataKey } from '../types/metadata.type';

export interface IPrompt {
    name: string;
    description: string;
    template: string;
    parameters?: any;
}

export const Prompt = (props: IPrompt) => {
    return SetMetadata(MetadataKey.MCP_PROMPT, props);
};
