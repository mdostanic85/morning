// Barrel export so callers (and the router's default system prompt table)
// can pull every job's prompt + schema from one place, e.g.:
//   import { taskExtractor } from "@/lib/llm/prompts";
export * as taskExtractor from "./taskExtractor";
export * as projectMatcher from "./projectMatcher";
export * as priorityPlanner from "./priorityPlanner";
export * as knowledgeExtractor from "./knowledgeExtractor";
export * as deliveryVerifier from "./deliveryVerifier";
export * as dailyMemory from "./dailyMemory";
