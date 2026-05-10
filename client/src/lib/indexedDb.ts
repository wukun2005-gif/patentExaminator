import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type {
  PatentCase,
  SourceDocument,
  TextIndex,
  ClaimNode,
  ClaimFeature,
  NoveltyComparison,
  InventiveStepAnalysis,
  ChatMessage
} from "@shared/types/domain";
import type { FeedbackItem } from "@shared/types/feedback";
import type { AppSettings } from "@shared/types/agents";

export interface PatentExaminerDB extends DBSchema {
  cases: {
    key: string;
    value: PatentCase;
    indexes: { "by-updatedAt": string };
  };
  documents: {
    key: string;
    value: SourceDocument;
    indexes: { "by-caseId": string; "by-role": string; "by-fileHash": string };
  };
  textIndex: {
    key: string;
    value: TextIndex & { documentId: string };
  };
  claimNodes: {
    key: string;
    value: ClaimNode;
    indexes: { "by-caseId": string };
  };
  claimCharts: {
    key: string;
    value: ClaimFeature;
    indexes: { "by-caseId": string; "by-claimNumber": number };
  };
  novelty: {
    key: string;
    value: NoveltyComparison;
    indexes: { "by-caseId": string; "by-referenceId": string };
  };
  inventive: {
    key: string;
    value: InventiveStepAnalysis;
    indexes: { "by-caseId": string };
  };
  ocrCache: {
    key: string;
    value: { cacheKey: string; text: string; createdAt: number };
  };
  chatMessages: {
    key: string;
    value: ChatMessage;
    indexes: {
      "by-caseId": string;
      "by-moduleScope": string;
      "by-createdAt": string;
    };
  };
  feedback: {
    key: string;
    value: FeedbackItem;
    indexes: {
      "by-caseId": string;
      "by-subjectType": string;
      "by-subjectId": string;
    };
  };
  settings: {
    key: string;
    value: AppSettings & { id: string };
  };
}

const DB_NAME = "patent-examiner-v1";
const DB_VERSION = 1;

export async function openPatentDB(): Promise<IDBPDatabase<PatentExaminerDB>> {
  return openDB<PatentExaminerDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // cases
      if (!db.objectStoreNames.contains("cases")) {
        const caseStore = db.createObjectStore("cases", { keyPath: "id" });
        caseStore.createIndex("by-updatedAt", "updatedAt");
      }

      // documents
      if (!db.objectStoreNames.contains("documents")) {
        const docStore = db.createObjectStore("documents", { keyPath: "id" });
        docStore.createIndex("by-caseId", "caseId");
        docStore.createIndex("by-role", "role");
        docStore.createIndex("by-fileHash", "fileHash");
      }

      // textIndex
      if (!db.objectStoreNames.contains("textIndex")) {
        db.createObjectStore("textIndex", { keyPath: "documentId" });
      }

      // claimNodes
      if (!db.objectStoreNames.contains("claimNodes")) {
        const claimStore = db.createObjectStore("claimNodes", { keyPath: "id" });
        claimStore.createIndex("by-caseId", "caseId");
      }

      // claimCharts
      if (!db.objectStoreNames.contains("claimCharts")) {
        const chartStore = db.createObjectStore("claimCharts", { keyPath: "id" });
        chartStore.createIndex("by-caseId", "caseId");
        chartStore.createIndex("by-claimNumber", "claimNumber");
      }

      // novelty
      if (!db.objectStoreNames.contains("novelty")) {
        const noveltyStore = db.createObjectStore("novelty", { keyPath: "id" });
        noveltyStore.createIndex("by-caseId", "caseId");
        noveltyStore.createIndex("by-referenceId", "referenceId");
      }

      // inventive
      if (!db.objectStoreNames.contains("inventive")) {
        const inventiveStore = db.createObjectStore("inventive", { keyPath: "id" });
        inventiveStore.createIndex("by-caseId", "caseId");
      }

      // ocrCache
      if (!db.objectStoreNames.contains("ocrCache")) {
        db.createObjectStore("ocrCache", { keyPath: "cacheKey" });
      }

      // chatMessages
      if (!db.objectStoreNames.contains("chatMessages")) {
        const chatStore = db.createObjectStore("chatMessages", { keyPath: "id" });
        chatStore.createIndex("by-caseId", "caseId");
        chatStore.createIndex("by-moduleScope", "moduleScope");
        chatStore.createIndex("by-createdAt", "createdAt");
      }

      // feedback
      if (!db.objectStoreNames.contains("feedback")) {
        const feedbackStore = db.createObjectStore("feedback", { keyPath: "id" });
        feedbackStore.createIndex("by-caseId", "caseId");
        feedbackStore.createIndex("by-subjectType", "subjectType");
        feedbackStore.createIndex("by-subjectId", "subjectId");
      }

      // settings
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }
    }
  });
}

// Singleton for test injection
let dbInstance: IDBPDatabase<PatentExaminerDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<PatentExaminerDB>> {
  if (!dbInstance) {
    dbInstance = await openPatentDB();
  }
  return dbInstance;
}

export function setDBInstance(db: IDBPDatabase<PatentExaminerDB> | null): void {
  dbInstance = db;
}
