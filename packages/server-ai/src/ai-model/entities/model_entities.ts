export function valueOf<T>(enumObj: T, value: string): T[keyof T] {
    const enumValues = Object.values(enumObj);
    if (enumValues.includes(value as T[keyof T])) {
        return value as T[keyof T];
    }
    throw new Error(`Invalid enum value: ${value}`);
}

export enum DefaultParameterName {
    TEMPERATURE = "temperature",
    TOP_P = "top_p",
    TOP_K = "top_k",
    PRESENCE_PENALTY = "presence_penalty",
    FREQUENCY_PENALTY = "frequency_penalty",
    MAX_TOKENS = "max_tokens",
    RESPONSE_FORMAT = "response_format",
    JSON_SCHEMA = "json_schema"
}

export interface ModelUsage {
    // 这里可以根据需要添加具体的属性
  token?: number;
}
