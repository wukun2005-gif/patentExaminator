import type { ZodSchema } from "zod";
import {
  claimChartSchema,
  noveltySchema,
  inventiveSchema,
  summarySchema,
  opinionAnalysisSchema,
  argumentMappingSchema,
  reexamDraftSchema,
  classifyDocumentsOutputSchema,
} from "../index.js";
import { searchReferencesFilterSchema } from "../schemas/searchReferences.schema.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const STRUCTURED_AGENT_SCHEMAS: Record<string, ZodSchema> = {
  "claim-chart": claimChartSchema,
  novelty: noveltySchema,
  inventive: inventiveSchema,
  summary: summarySchema,
  "opinion-analysis": opinionAnalysisSchema,
  "argument-analysis": argumentMappingSchema,
  "reexam-draft": reexamDraftSchema,
  "classify-documents": classifyDocumentsOutputSchema,
  "search-references": searchReferencesFilterSchema,
};

const TEXT_AGENTS = new Set(["chat", "interpret", "translate", "extract-case-fields"]);

export function isStructuredAgent(agent: string): boolean {
  return agent in STRUCTURED_AGENT_SCHEMAS;
}

export function validateAgentResponse(agent: string, json: unknown): ValidationResult {
  if (TEXT_AGENTS.has(agent)) {
    return { valid: true, errors: [] };
  }

  const schema = STRUCTURED_AGENT_SCHEMAS[agent];
  if (!schema) {
    return { valid: true, errors: [] };
  }

  const result = schema.safeParse(json);
  if (result.success) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`
    ),
  };
}