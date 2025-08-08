import { markdownCalculationParams } from "./prompts";
import { CalculationProperty, CalculationType } from "../models";

describe("markdownCalculationParams", () => {
  it("should extract parameter names from formula with multiple params", () => {
    const measure: CalculationProperty = {
      name: "Test Measure",
      calculationType: CalculationType.Calculated,
      formula: "SUM([@param1]) + AVG([@param2])",
      // other required properties can be mocked as needed
    } as CalculationProperty;
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();

    markdownCalculationParams(measure);

    expect(consoleSpy).toHaveBeenCalledWith(["param1", "param2"]);
    consoleSpy.mockRestore();
  });

  it("should extract single parameter from formula", () => {
    const measure: CalculationProperty = {
      name: "Test Measure",
      calculationType: CalculationType.Calculated,
      formula: "COUNT([@single Param]) * [@single_Param]",
    } as CalculationProperty;

    const result = markdownCalculationParams(measure);
    expect(result).toEqual(["single Param", "single_Param"]);
  });

  it("should not log anything if no parameters in formula", () => {
    const measure: CalculationProperty = {
      name: "Test Measure",
      calculationType: CalculationType.Calculated,
      formula: "SUM(value)",
    } as CalculationProperty;
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();

    markdownCalculationParams(measure);

    expect(consoleSpy).toHaveBeenCalledWith([]);
    consoleSpy.mockRestore();
  });

  it("should handle undefined formula gracefully", () => {
    const measure: CalculationProperty = {
      name: "Test Measure",
      calculationType: CalculationType.Calculated,
      formula: undefined,
    } as CalculationProperty;
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();

    markdownCalculationParams(measure);

    expect(consoleSpy).toHaveBeenCalledWith([]);
    consoleSpy.mockRestore();
  });
});