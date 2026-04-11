import { cloneValue } from "@xpert-ai/core";
import { IStoryToolbarResourceStrings, StoryToolbarResourceStringsEN } from "./story-toolbar-resources";

export interface IResourceStrings extends IStoryToolbarResourceStrings { }

export const CurrentResourceStrings = {
    StoryToolbarResourceStrings: cloneValue(StoryToolbarResourceStringsEN),
};

const updateResourceStrings = (currentStrings: IResourceStrings, newStrings: IResourceStrings) => {
    for (const key of Object.keys(newStrings)) {
        if (key in currentStrings) {
            currentStrings[key] = newStrings[key];
        }
    }
};

/**
 * Changes the resource strings for all components in the application
 * ```
 * @param resourceStrings to be applied
 */
export const changei18n = (resourceStrings: IResourceStrings) => {
    for (const key of Object.keys(CurrentResourceStrings)) {
        updateResourceStrings(CurrentResourceStrings[key], resourceStrings);
    }
};

/**
 * Returns current resource strings for all components
 */
export const getCurrentResourceStrings = (): IResourceStrings => ({
    ...CurrentResourceStrings.StoryToolbarResourceStrings,
});
