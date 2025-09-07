import { isNil } from "./isNil";

export function isBlank(value: unknown) {
  return isNil(value) || (typeof value === "string" && !value.trim())
}