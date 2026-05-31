/**
 * 知识库类型定义 — B-018 法规知识库 RAG 系统
 */

// ── 知识库来源 ──────────────────────────────────────────

export type KnowledgeSourceType = "file" | "url";

export type KnowledgeFileFormat =
  | "pdf"
  | "txt"
  | "md"
  | "docx"
  | "doc"
  | "json"
  | "xlsx"
  | "xls"
  | "csv"
  | "jpg"
  | "jpeg"
  | "png";

export type KnowledgeMediaType = "text" | "table" | "image";

/** 知识库来源元数据 */
export interface KnowledgeSource {
  id: string;
  type: KnowledgeSourceType;
  name: string;
  format: KnowledgeFileFormat | "html"; // url 抓取的内容视为 html
  mediaType: KnowledgeMediaType;
  /** 文件大小（字节），URL 来源为 0 */
  size: number;
  /** 文件 SHA-256 hash（用于去重） */
  fileHash?: string;
  /** 原始文件在 IndexedDB 中的 blob key（file 类型） */
  blobKey?: string;
  /** URL 来源的原始地址 */
  sourceUrl?: string;
  /** 切片总数 */
  chunkCount: number;
  /** 向量化状态 */
  embedStatus: "pending" | "processing" | "completed" | "failed";
  /** 错误信息 */
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// ── 切片 ────────────────────────────────────────────────

export type ChunkStrategy =
  | "section"      // 按章节编号切片（审查指南）
  | "article"      // 按条文切片（法律、实施细则、司法解释）
  | "case-point"   // 按案件要点切片（典型案例）
  | "heading"      // 按标题层级切片（MD/DOCX/网页）
  | "json-key"     // 按 JSON 顶层 key 或数组元素切片
  | "table-row"    // 按表格行切片（Excel/CSV）
  | "image-ocr"    // 图片 OCR 文本
  | "auto";        // 自动选择

/** 知识库切片 */
export interface KnowledgeChunk {
  id: string;
  sourceId: string;
  /** 切片在源文件中的序号（从 0 开始） */
  index: number;
  /** 切片文本内容 */
  text: string;
  /** 切片策略 */
  strategy: ChunkStrategy;
  /** 元数据：来源章节/条文号/行号等 */
  metadata: ChunkMetadata;
  /** 向量是否已生成 */
  embedded: boolean;
  createdAt: string;
}

export interface ChunkMetadata {
  /** 来源文件名 */
  fileName: string;
  /** 媒体类型 */
  mediaType: KnowledgeMediaType;
  /** 章节编号（如 "第二部分第四章3.2.1"） */
  sectionId?: string;
  /** 条文编号（如 "第22条第2款"） */
  articleId?: string;
  /** 表格 sheet 名 */
  sheetName?: string;
  /** 表格行号 */
  rowIndex?: number;
  /** 表格列名列表（用于表头上下文） */
  columnNames?: string[];
  /** 索引列名（表格模式） */
  indexColumn?: string;
  /** 索引列值（表格模式） */
  indexValue?: string;
  /** 图片描述来源 */
  imageSource?: "ocr" | "multimodal";
  /** 原始页码 */
  pageNumber?: number;
  /** 文档类型标注 */
  documentCategory?: string;
}

// ── 向量 ────────────────────────────────────────────────

export interface KnowledgeVector {
  /** chunk ID */
  chunkId: string;
  /** 浮点向量 */
  vector: number[];
  /** embedding 模型标识 */
  modelId: string;
  createdAt: string;
}

// ── 检索结果 ────────────────────────────────────────────

export interface KnowledgeSearchResult {
  chunk: KnowledgeChunk;
  score: number;
}

// ── 配置 ────────────────────────────────────────────────

export type EmbedProviderType = "local" | "remote";

export interface KnowledgeConfig {
  /** 是否启用知识库 */
  enabled: boolean;
  /** embedding 提供方式 */
  embedProvider: EmbedProviderType;
  /** 远程 embedding 时使用的 provider ID（复用现有 ProviderId） */
  remoteProviderId?: string;
  /** 远程 embedding 时使用的模型 ID */
  remoteModelId?: string;
  /** 检索返回的 top-k 数量 */
  topK: number;
  /** 相似度阈值（低于此值不返回） */
  scoreThreshold: number;
}

export const DEFAULT_KNOWLEDGE_CONFIG: KnowledgeConfig = {
  enabled: false,
  embedProvider: "local",
  topK: 5,
  scoreThreshold: 0.3,
};
