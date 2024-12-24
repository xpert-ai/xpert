import { devEnvironment, devToggleFeatures } from "./environment";
import { prodEnvironment, prodToggleFeatures } from "./environment.prod";

export const environment = process.env.NODE_ENV === 'production' ? prodEnvironment : devEnvironment
export const toggleFeatures = process.env.NODE_ENV === 'production' ? prodToggleFeatures : devToggleFeatures
