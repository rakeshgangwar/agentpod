import type { NodeExecutor } from "./base";
import { createStepResult } from "./base";
import type { NodeExecutionParams } from "../utils/context";

interface SplitParams {
  branches: number;
}

export const splitExecutor: NodeExecutor = {
  type: "split",
  category: "logic",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    
    if (params.branches !== undefined) {
      const branches = params.branches as number;
      if (typeof branches !== "number" || branches < 2 || branches > 10) {
        errors.push("Branches must be a number between 2 and 10");
      }
    }
    
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<SplitParams>;
    const branches = p.branches ?? 2;
    
    const branchNames: string[] = [];
    for (let i = 0; i < branches; i++) {
      branchNames.push(`branch_${i + 1}`);
    }
    
    return createStepResult({
      branches: branchNames,
      branchCount: branches,
      splitAt: new Date().toISOString(),
    });
  },
};
