import { create } from "zustand";

export interface TokenUsageRecord {
  caseId: string;
  agent: string;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  timestamp: number;
}

interface TokenUsageState {
  records: TokenUsageRecord[];
  addRecord: (record: Omit<TokenUsageRecord, "timestamp">) => void;
  getCaseUsage: (caseId: string) => { input: number; output: number; total: number };
  getTotalUsage: () => { input: number; output: number; total: number };
  clearCaseUsage: (caseId: string) => void;
}

export const useTokenUsageStore = create<TokenUsageState>((set, get) => ({
  records: [],

  addRecord: (record) => {
    set((state) => ({
      records: [...state.records, { ...record, timestamp: Date.now() }]
    }));
  },

  getCaseUsage: (caseId) => {
    const caseRecords = get().records.filter((r) => r.caseId === caseId);
    return caseRecords.reduce(
      (acc, r) => ({
        input: acc.input + r.inputTokens,
        output: acc.output + r.outputTokens,
        total: acc.total + r.totalTokens
      }),
      { input: 0, output: 0, total: 0 }
    );
  },

  getTotalUsage: () => {
    return get().records.reduce(
      (acc, r) => ({
        input: acc.input + r.inputTokens,
        output: acc.output + r.outputTokens,
        total: acc.total + r.totalTokens
      }),
      { input: 0, output: 0, total: 0 }
    );
  },

  clearCaseUsage: (caseId) => {
    set((state) => ({
      records: state.records.filter((r) => r.caseId !== caseId)
    }));
  }
}));
