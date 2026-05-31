import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type {
  PatentCase,
  SourceDocument,
  TextIndex,
  ClaimNode,
  ClaimFeature,
  NoveltyComparison,
  InventiveStepAnalysis,
  FormalDefect,
  ChatMessage,
  ChatSession,
  OfficeActionAnalysis,
  ArgumentMapping
} from "@shared/types/domain";
import type { FeedbackItem } from "@shared/types/feedback";
import type { AppSettings } from "@shared/types/agents";
import type { KnowledgeSource, KnowledgeChunk, KnowledgeVector } from "@shared/types/knowledge";
import { createLogger } from "./logger";

const log = createLogger("IndexedDB");

export interface PatentExaminerDB extends DBSchema {
  cases: {
    key: string;
    value: PatentCase;
    indexes: { "by-updatedAt": string };
  };
  interpretSummaries: {
    key: string;
    value:
      | { caseId: string; summary: string; updatedAt: string }
      | { caseId: string; summaries: Record<string, string>; updatedAt: string };
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
  defects: {
    key: string;
    value: FormalDefect;
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
      "by-sessionId": string;
    };
  };
  chatSessions: {
    key: string;
    value: ChatSession;
    indexes: { "by-caseId": string };
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
  opinionAnalyses: {
    key: string;
    value: OfficeActionAnalysis;
    indexes: { "by-caseId": string };
  };
  argumentMappings: {
    key: string;
    value: ArgumentMapping;
    indexes: { "by-caseId": string };
  };
  reexamDrafts: {
    key: string;
    value: { id: string; [key: string]: unknown };
  };
  summaries: {
    key: string;
    value: { id: string; [key: string]: unknown };
  };
  runMarkers: {
    key: string;
    value: { id: string; caseId: string; module: string; timestamp: string };
    indexes: { "by-caseId": string; "by-module": string };
  };
  searchSessions: {
    key: string;
    value: {
      id: string;
      caseId: string;
      searchTerms: string[];
      providerResults: Array<{
        providerId: string;
        providerName: string;
        resultCount: number;
        candidateCount: number;
      }>;
      createdAt: string;
      updatedAt: string;
    };
    indexes: { "by-caseId": string };
  };
  knowledgeSources: {
    key: string;
    value: KnowledgeSource;
    indexes: { "by-mediaType": string };
  };
  knowledgeChunks: {
    key: string;
    value: KnowledgeChunk;
    indexes: { "by-sourceId": string; "by-embedded": string };
  };
  knowledgeVectors: {
    key: string;
    value: KnowledgeVector;
    indexes: { "by-modelId": string };
  };
}

const DB_NAME = "patent-examiner-v1";
const DB_VERSION = 10;

export async function openPatentDB(): Promise<IDBPDatabase<PatentExaminerDB>> {
  return openDB<PatentExaminerDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion) {
      log(
        `Upgrading patent-examiner-v1 from v${oldVersion} to v${newVersion}`
      );

      if (oldVersion < 1) {
        const caseStore = db.createObjectStore("cases", { keyPath: "id" });
        caseStore.createIndex("by-updatedAt", "updatedAt");

        db.createObjectStore("interpretSummaries", { keyPath: "caseId" });

        const docStore = db.createObjectStore("documents", { keyPath: "id" });
        docStore.createIndex("by-caseId", "caseId");
        docStore.createIndex("by-role", "role");
        docStore.createIndex("by-fileHash", "fileHash");

        db.createObjectStore("textIndex", { keyPath: "documentId" });

        const claimStore = db.createObjectStore("claimNodes", { keyPath: "id" });
        claimStore.createIndex("by-caseId", "caseId");

        const chartStore = db.createObjectStore("claimCharts", { keyPath: "id" });
        chartStore.createIndex("by-caseId", "caseId");
        chartStore.createIndex("by-claimNumber", "claimNumber");

        const noveltyStore = db.createObjectStore("novelty", { keyPath: "id" });
        noveltyStore.createIndex("by-caseId", "caseId");
        noveltyStore.createIndex("by-referenceId", "referenceId");

        const inventiveStore = db.createObjectStore("inventive", { keyPath: "id" });
        inventiveStore.createIndex("by-caseId", "caseId");

        const defectsStore = db.createObjectStore("defects", { keyPath: "id" });
        defectsStore.createIndex("by-caseId", "caseId");

        db.createObjectStore("ocrCache", { keyPath: "cacheKey" });

        const chatStore = db.createObjectStore("chatMessages", { keyPath: "id" });
        chatStore.createIndex("by-caseId", "caseId");
        chatStore.createIndex("by-moduleScope", "moduleScope");
        chatStore.createIndex("by-createdAt", "createdAt");
        chatStore.createIndex("by-sessionId", "sessionId");

        const sessionStore = db.createObjectStore("chatSessions", { keyPath: "id" });
        sessionStore.createIndex("by-caseId", "caseId");

        const feedbackStore = db.createObjectStore("feedback", { keyPath: "id" });
        feedbackStore.createIndex("by-caseId", "caseId");
        feedbackStore.createIndex("by-subjectType", "subjectType");
        feedbackStore.createIndex("by-subjectId", "subjectId");

        db.createObjectStore("settings", { keyPath: "id" });
      }

      if (oldVersion < 2) {
        const opinionStore = db.createObjectStore("opinionAnalyses", { keyPath: "id" });
        opinionStore.createIndex("by-caseId", "caseId");

        const argStore = db.createObjectStore("argumentMappings", { keyPath: "id" });
        argStore.createIndex("by-caseId", "caseId");
      }

      if (oldVersion < 3) {
        db.createObjectStore("reexamDrafts", { keyPath: "id" });
        db.createObjectStore("summaries", { keyPath: "id" });
      }

      if (oldVersion < 7) {
        if (db.objectStoreNames.contains("chatMessages")) {
          db.deleteObjectStore("chatMessages");
        }
        const chatStore = db.createObjectStore("chatMessages", { keyPath: "id" });
        chatStore.createIndex("by-caseId", "caseId");
        chatStore.createIndex("by-moduleScope", "moduleScope");
        chatStore.createIndex("by-createdAt", "createdAt");
        chatStore.createIndex("by-sessionId", "sessionId");
      }

      if (oldVersion < 8) {
        const markerStore = db.createObjectStore("runMarkers", { keyPath: "id" });
        markerStore.createIndex("by-caseId", "caseId");
        markerStore.createIndex("by-module", "module");
      }

      if (oldVersion < 9) {
        const searchSessionStore = db.createObjectStore("searchSessions", { keyPath: "id" });
        searchSessionStore.createIndex("by-caseId", "caseId");
      }

      if (oldVersion < 10) {
        const ksStore = db.createObjectStore("knowledgeSources", { keyPath: "id" });
        ksStore.createIndex("by-mediaType", "mediaType");

        const kcStore = db.createObjectStore("knowledgeChunks", { keyPath: "id" });
        kcStore.createIndex("by-sourceId", "sourceId");
        kcStore.createIndex("by-embedded", "embedded");

        const kvStore = db.createObjectStore("knowledgeVectors", { keyPath: "chunkId" });
        kvStore.createIndex("by-modelId", "modelId");
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