import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import type { PatentCase, SourceDocument } from "@shared/types/domain";
import { extractPdfText } from "../../lib/pdfText";
import { extractDocxText } from "../../lib/docxText";
import { extractHtmlText } from "../../lib/htmlText";
import { buildTextIndex } from "../../lib/textIndex";
import { computeFileHash } from "../../lib/fileHash";
import { extractCaseFields, extractCaseFieldsFallback, type ExtractedFields } from "../../lib/caseFieldExtractor";
import { createDocument, readDocumentsByCaseId, updateDocument, deleteDocument } from "../../lib/repositories/documentRepo";
import { createClaimNode } from "../../lib/repositories/claimRepo";
import { readCaseById, createCase, updateCase } from "../../lib/repositories/caseRepo";
import { useCaseStore, useDocumentsStore, useClaimsStore, useSettingsStore, useReferencesStore } from "../../store";
import { AgentClient } from "../../agent/AgentClient";
import { ErrorBanner } from "../../lib/errorDisplay";
import type { DocumentClassification } from "../../agent/contracts";

const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".html"];

const ROLE_META: Record<SourceDocument["role"], { label: string; icon: string }> = {
  application: { label: "申请文件", icon: "📄" },
  "office-action": { label: "审查意见通知书", icon: "📋" },
  "office-action-response": { label: "意见陈述书", icon: "✏️" },
  reference: { label: "对比文件", icon: "📚" }
};

const ROLE_ORDER: SourceDocument["role"][] = [
  "application",
  "office-action",
  "office-action-response",
  "reference"
];

interface CaseFormValues {
  title: string;
  applicationNumber: string;
  applicant: string;
  applicationDate: string;
  priorityDate: string;
  targetClaimNumber: number;
  textVersion: string;
  examinerNotes: string;
}

const DEFAULT_VALUES: CaseFormValues = {
  title: "",
  applicationNumber: "",
  applicant: "",
  applicationDate: "",
  priorityDate: "",
  targetClaimNumber: 1,
  textVersion: "original",
  examinerNotes: ""
};

export function CaseSetupPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const { currentCase, setCurrentCase } = useCaseStore();
  const { documents, addDocument, setDocuments } = useDocumentsStore();
  const { claimNodes, setClaimNodes } = useClaimsStore();
  const { references } = useReferencesStore();
  const { settings } = useSettingsStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fileStatuses, setFileStatuses] = useState<Record<string, string>>({});
  const [extracted, setExtracted] = useState<ExtractedFields | null>(null);
  const [extractingFields, setExtractingFields] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [uploadRole, setUploadRole] = useState<SourceDocument["role"]>("application");
  // 新增：批量上传和分类相关状态
  const [batchUploading, setBatchUploading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [_pendingDocuments, setPendingDocuments] = useState<SourceDocument[]>([]);
  const [draggedDoc, setDraggedDoc] = useState<SourceDocument | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors }
  } = useForm<CaseFormValues>({
    defaultValues: DEFAULT_VALUES,
    mode: "onChange"
  });

  // Load existing case and documents from IndexedDB
  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    (async () => {
      try {
        const [existing, docs] = await Promise.all([
          readCaseById(caseId),
          readDocumentsByCaseId(caseId)
        ]);
        if (cancelled) return;
        if (existing) {
          setCurrentCase(existing);
          reset({
            title: existing.title ?? "",
            applicationNumber: existing.applicationNumber ?? "",
            applicant: existing.applicant ?? "",
            applicationDate: existing.applicationDate ?? "",
            priorityDate: existing.priorityDate ?? "",
            targetClaimNumber: existing.targetClaimNumber ?? 1,
            textVersion: existing.textVersion ?? "original",
            examinerNotes: existing.examinerNotes ?? ""
          });
        }
        setDocuments(docs);
      } catch {
        /* IndexedDB unavailable */
      }
    })();
    return () => { cancelled = true; };
  }, [caseId, reset, setCurrentCase, setDocuments]);

  // AI extraction handler — triggered by user button click
  const handleAiExtract = async () => {
    if (!caseId) return;
    const appDocs = documents.filter((d) => d.role === "application");
    if (appDocs.length === 0) return;

    const docInputs = appDocs.map((d) => ({ fileName: d.fileName, text: d.extractedText }));
    setExtractingFields(true);
    setExtractError(null);
    try {
      const client = new AgentClient(settings.mode, "/api", settings);
      const fields = await extractCaseFields(docInputs, caseId, client);
      setExtracted(fields);
      applyExtracted(fields, currentCase);
      await persistClaims(fields.claims, setClaimNodes);
    } catch (err) {
      setExtractError(`AI 提取失败: ${err instanceof Error ? err.message : String(err)}，已降级为本地解析`);
      const fallback = extractCaseFieldsFallback(docInputs, caseId);
      setExtracted(fallback);
      applyExtracted(fallback, currentCase);
      await persistClaims(fallback.claims, setClaimNodes);
    } finally {
      setExtractingFields(false);
    }
  };

  // Apply extracted fields to form (only fill empty fields)
  const applyExtracted = (fields: ExtractedFields, existingCase?: PatentCase | null) => {
    if (fields.title && !existingCase?.title) setValue("title", fields.title);
    if (fields.applicationNumber && !existingCase?.applicationNumber) setValue("applicationNumber", fields.applicationNumber);
    if (fields.applicant && !existingCase?.applicant) setValue("applicant", fields.applicant);
    if (fields.applicationDate && !existingCase?.applicationDate) setValue("applicationDate", fields.applicationDate);
    if (fields.priorityDate && !existingCase?.priorityDate) setValue("priorityDate", fields.priorityDate);
    if (fields.targetClaimNumber && (!existingCase || existingCase.targetClaimNumber === 1)) {
      setValue("targetClaimNumber", fields.targetClaimNumber);
    }
  };

  // Debounced auto-save to IndexedDB (400ms)
  const watchAll = watch();
  useEffect(() => {
    if (!caseId) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!watchAll.title?.trim() || !watchAll.applicationDate) return;

      const now = new Date().toISOString();
      const caseData = {
        id: caseId,
        applicationNumber: watchAll.applicationNumber || null,
        title: watchAll.title,
        applicationDate: watchAll.applicationDate,
        patentType: "invention" as const,
        textVersion: watchAll.textVersion as PatentCase["textVersion"],
        targetClaimNumber: watchAll.targetClaimNumber,
        guidelineVersion: "2023",
        reexaminationRound: currentCase?.reexaminationRound ?? 1,
        workflowState: (currentCase?.workflowState ?? "empty") as PatentCase["workflowState"],
        createdAt: currentCase?.createdAt ?? now,
        updatedAt: now,
        ...(watchAll.applicant ? { applicant: watchAll.applicant } : {}),
        ...(watchAll.priorityDate ? { priorityDate: watchAll.priorityDate } : {}),
        ...(watchAll.examinerNotes ? { examinerNotes: watchAll.examinerNotes } : {})
      } satisfies PatentCase;

      if (currentCase) {
        await updateCase(caseData);
      } else {
        await createCase(caseData);
      }
      setCurrentCase(caseData);
    }, 400);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watchAll), caseId]);

  // Handle file upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !caseId) return;

    for (const file of Array.from(files)) {
      const ext = getFileExtension(file.name);
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        setFileStatuses((prev) => ({ ...prev, [file.name]: `不支持的格式: ${ext}` }));
        continue;
      }

      setFileStatuses((prev) => ({ ...prev, [file.name]: "处理中..." }));

      try {
        const fileHash = await computeFileHash(file);
        let text = "";
        let textStatus: SourceDocument["textStatus"] = "empty";
        let textLayerStatus: SourceDocument["textLayerStatus"] = "unknown";

        if (ext === ".pdf") {
          const result = await extractPdfText(file);
          text = result.text;
          textLayerStatus = result.hasTextLayer ? "present" : "absent";
          textStatus = result.text ? "extracted" : "empty";
        } else if (ext === ".docx") {
          const result = await extractDocxText(file);
          text = result.text;
          textStatus = result.text ? "extracted" : "empty";
        } else if (ext === ".html") {
          const result = extractHtmlText(await file.text());
          text = result.text;
          textStatus = result.text ? "extracted" : "empty";
        } else if (ext === ".txt") {
          text = await file.text();
          textStatus = text ? "extracted" : "empty";
        }

        const textIndex = buildTextIndex(text);
        const doc: SourceDocument = {
          id: `doc-${fileHash.slice(0, 8)}`,
          caseId,
          role: uploadRole,
          fileName: file.name,
          fileType: ext.replace(".", "") as SourceDocument["fileType"],
          fileHash,
          textLayerStatus,
          textStatus,
          extractedText: text,
          textIndex,
          createdAt: new Date().toISOString()
        };

        await createDocument(doc);
        addDocument(doc);
        setFileStatuses((prev) => ({ ...prev, [file.name]: "完成" }));
      } catch (err) {
        setFileStatuses((prev) => ({ ...prev, [file.name]: `出错: ${err}` }));
      }
    }

    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Validation
  const validateTitle = (value: string) => {
    if (!value || value.trim().length === 0) return "发明名称为必填项";
    if (value.length > 120) return "发明名称不超过 120 字";
    return true;
  };
  const validateAppNumber = (value: string) => {
    if (!value || value.trim().length === 0) return true;
    return /^(CN)?\d{9,13}[A-Z]?$/.test(value.trim()) || "申请号格式不正确";
  };
  const validateAppDate = (value: string) => {
    if (!value) return "申请日为必填项";
    if (value > new Date().toISOString().slice(0, 10)) return "申请日不能晚于今日";
    return true;
  };
  const validatePriorityDate = (value: string) => {
    if (!value) return true;
    const appDate = watch("applicationDate");
    if (appDate && value > appDate) return "优先权日不能晚于申请日";
    return true;
  };

  const handleRoleUpload = (role: SourceDocument["role"]) => {
    setUploadRole(role);
    fileInputRef.current?.click();
  };

  // ========== 批量上传和 AI 分类功能 ==========

  // 批量上传处理：用户一次性上传所有文件，先存为 pending 状态
  const handleBatchFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !caseId) return;

    setBatchUploading(true);
    setClassifyError(null);
    const newPendingDocs: SourceDocument[] = [];

    for (const file of Array.from(files)) {
      const ext = getFileExtension(file.name);
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        setFileStatuses((prev) => ({ ...prev, [file.name]: `不支持的格式: ${ext}` }));
        continue;
      }

      setFileStatuses((prev) => ({ ...prev, [file.name]: "处理中..." }));

      try {
        const fileHash = await computeFileHash(file);
        let text = "";
        let textStatus: SourceDocument["textStatus"] = "empty";
        let textLayerStatus: SourceDocument["textLayerStatus"] = "unknown";

        if (ext === ".pdf") {
          const result = await extractPdfText(file);
          text = result.text;
          textLayerStatus = result.hasTextLayer ? "present" : "absent";
          textStatus = result.text ? "extracted" : "empty";
        } else if (ext === ".docx") {
          const result = await extractDocxText(file);
          text = result.text;
          textStatus = result.text ? "extracted" : "empty";
        } else if (ext === ".html") {
          const result = extractHtmlText(await file.text());
          text = result.text;
          textStatus = result.text ? "extracted" : "empty";
        } else if (ext === ".txt") {
          text = await file.text();
          textStatus = text ? "extracted" : "empty";
        }

        const textIndex = buildTextIndex(text);
        // 批量上传时先使用 'reference' 作为默认角色，后续由 AI 分类
        const doc: SourceDocument = {
          id: `doc-${fileHash.slice(0, 8)}`,
          caseId,
          role: "reference", // 默认角色，待 AI 分类后更新
          fileName: file.name,
          fileType: ext.replace(".", "") as SourceDocument["fileType"],
          fileHash,
          textLayerStatus,
          textStatus,
          extractedText: text,
          textIndex,
          createdAt: new Date().toISOString()
        };

        newPendingDocs.push(doc);
        setFileStatuses((prev) => ({ ...prev, [file.name]: "待分类" }));
      } catch (err) {
        setFileStatuses((prev) => ({ ...prev, [file.name]: `出错: ${err}` }));
      }
    }

    setPendingDocuments(newPendingDocs);
    setBatchUploading(false);

    // 自动触发 AI 分类
    if (newPendingDocs.length > 0) {
      await classifyDocuments(newPendingDocs);
    }

    // Reset file input
    if (batchFileInputRef.current) batchFileInputRef.current.value = "";
  };

  // AI 分类：调用 classify-documents Agent
  const classifyDocuments = async (docs: SourceDocument[]) => {
    if (!caseId || docs.length === 0) return;

    setClassifying(true);
    setClassifyError(null);

    try {
      const client = new AgentClient(settings.mode, "/api", settings);
      
      const request = {
        caseId,
        documents: docs.map((doc, index) => ({
          fileIndex: index,
          fileName: doc.fileName,
          textSample: doc.extractedText.slice(0, 2000) // 取前 2000 字符用于分类
        }))
      };

      const result = await client.runClassifyDocuments(request);
      
      // 根据分类结果更新文档角色
      await applyClassificationResults(docs, result.classifications);
      
      // 清空待分类文档
      setPendingDocuments([]);

      // 更新文件状态
      for (const classification of result.classifications) {
        setFileStatuses((prev) => ({ ...prev, [classification.fileName]: "已分类" }));
      }

      // 显示警告（如有）
      if (result.warnings && result.warnings.length > 0) {
        console.warn("AI 分类警告:", result.warnings);
      }
    } catch (err) {
      setClassifyError(`AI 分类失败: ${err instanceof Error ? err.message : String(err)}，所有文件已归入"对比文件"类别`);
      // 分类失败时，将所有待分类文档保存为 reference
      for (const doc of docs) {
        await createDocument(doc);
        addDocument(doc);
      }
      setPendingDocuments([]);
    } finally {
      setClassifying(false);
    }
  };

  // 应用 AI 分类结果
  const applyClassificationResults = async (
    docs: SourceDocument[],
    classifications: DocumentClassification[]
  ) => {
    for (const classification of classifications) {
      const doc = docs[classification.fileIndex];
      if (!doc) continue;
      
      // 更新文档角色
      const updatedDoc: SourceDocument = {
        ...doc,
        role: classification.role
      };
      
      // 保存到 IndexedDB（使用 put 操作，如果已存在则更新）
      await createDocument(updatedDoc);
    }
    
    // 分类完成后，重新从 IndexedDB 加载所有文档，确保 store 与数据库同步
    const allDocs = await readDocumentsByCaseId(caseId!);
    setDocuments(allDocs);
  };

  // ========== 文件管理功能（删除、移动） ==========

  // 删除文档
  const handleDeleteDocument = async (docId: string) => {
    try {
      await deleteDocument(docId);
      // 从 store 中移除
      setDocuments(documents.filter((d) => d.id !== docId));
    } catch (err) {
      console.error("删除文档失败:", err);
    }
  };

  // 移动文档到新的角色分类
  const handleMoveDocument = async (docId: string, newRole: SourceDocument["role"]) => {
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;
    
    const updatedDoc: SourceDocument = {
      ...doc,
      role: newRole
    };
    
    try {
      await updateDocument(updatedDoc);
      // 更新 store
      setDocuments(documents.map((d) => (d.id === docId ? updatedDoc : d)));
    } catch (err) {
      console.error("移动文档失败:", err);
    }
  };

  // 拖拽开始
  const handleDragStart = (doc: SourceDocument) => {
    setDraggedDoc(doc);
  };

  // 拖拽放置
  const handleDrop = (targetRole: SourceDocument["role"]) => {
    if (draggedDoc && draggedDoc.role !== targetRole) {
      handleMoveDocument(draggedDoc.id, targetRole);
    }
    setDraggedDoc(null);
  };

  // 拖拽结束
  const handleDragEnd = () => {
    setDraggedDoc(null);
  };

  const renderFieldHint = (field: string) => {
    if (!extracted?.confidence[field]) return null;
    return <span className="field-hint">自动提取</span>;
  };

  return (
    <div className="case-setup-page" data-testid="page-setup">
      <h2>案件基本信息导入</h2>
      <p className="section-desc">
        上传申请文件、审查意见通知书和意见陈述书，建立复审分析上下文。
      </p>

      {/* File upload section */}
      <section className="setup-section">
        <div className="setup-section__header">
          <h3>上传复审文件</h3>
          <button
            type="button"
            className="btn-batch-upload"
            onClick={() => batchFileInputRef.current?.click()}
            disabled={batchUploading || classifying}
            data-testid="btn-batch-upload"
          >
            {batchUploading || classifying ? (
              <><span className="spinner" />{classifying ? "AI 分类中..." : "处理中..."}</>
            ) : (
              <><span className="icon-ai" />批量上传（AI 自动分类）</>
            )}
          </button>
        </div>
        {classifyError && <ErrorBanner error={classifyError} data-testid="classify-error" />}
        <p className="section-desc">
          支持 PDF、DOCX、TXT、HTML 格式。可批量上传让 AI 自动分类，也可在各类别中单独上传。
        </p>

        <div className="file-role-grid">
          {ROLE_ORDER.map((role) => {
            const roleDocs = documents.filter((d) => d.role === role);
            const processingEntries = Object.entries(fileStatuses).filter(
              ([name]) => !documents.some((d) => d.fileName === name)
            );
            const isCurrentRoleProcessing =
              uploadRole === role && processingEntries.length > 0;
            const isDropTarget = draggedDoc && draggedDoc.role !== role;

            return (
              <div
                key={role}
                className={`file-role-card ${isDropTarget ? "file-role-card--drop-target" : ""}`}
                data-testid={`role-card-${role}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(role);
                }}
              >
                <div className="file-role-card__header">
                  <span className="file-role-card__icon">{ROLE_META[role].icon}</span>
                  <span className="file-role-card__label">{ROLE_META[role].label}</span>
                  {roleDocs.length > 0 && (
                    <span className="file-role-card__count">{roleDocs.length}</span>
                  )}
                </div>
                <div className="file-role-card__body">
                  {roleDocs.length === 0 && !isCurrentRoleProcessing && (
                    <span className="file-role-empty">
                      {isDropTarget ? "拖放到此处移动" : "暂无文件"}
                    </span>
                  )}
                  {roleDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="file-role-file file-role-file--draggable"
                      draggable
                      onDragStart={() => handleDragStart(doc)}
                      onDragEnd={handleDragEnd}
                      data-testid={`file-item-${doc.id}`}
                    >
                      <span className="file-role-file__name" title={doc.fileName}>
                        {doc.fileName}
                      </span>
                      <div className="file-role-file__actions">
                        <select
                          className="file-role-select"
                          value={doc.role}
                          onChange={(e) => handleMoveDocument(doc.id, e.target.value as SourceDocument["role"])}
                          title="移动到其他分类"
                        >
                          {ROLE_ORDER.map((r) => (
                            <option key={r} value={r}>{ROLE_META[r].label}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn-file-delete"
                          onClick={() => handleDeleteDocument(doc.id)}
                          title="删除文件"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                  {isCurrentRoleProcessing &&
                    processingEntries.map(([name, status]) => (
                      <div key={name} className="file-role-file file-role-file--processing">
                        <span className="file-role-file__name">{name}</span>
                        <span className={`file-role-file__badge ${
                          status === "完成" || status === "已分类" ? "file-badge-ok" : status === "处理中..." || status === "待分类" ? "file-badge-processing" : "file-badge-error"
                        }`}>
                          {status}
                        </span>
                      </div>
                    ))}
                </div>
                <div className="file-role-card__footer">
                  <button
                    type="button"
                    className="btn-upload"
                    onClick={() => handleRoleUpload(role)}
                    data-testid={`btn-upload-${role}`}
                  >
                    + 上传
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.html"
          multiple
          onChange={handleFileChange}
          data-testid="input-file-upload"
          className="file-input-hidden"
        />

        <input
          ref={batchFileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.html"
          multiple
          onChange={handleBatchFileChange}
          data-testid="input-batch-upload"
          className="file-input-hidden"
        />
      </section>

      {/* Case overview — aggregated summary after documents are uploaded */}
      {documents.length > 0 && (
        <section className="setup-section case-overview" data-testid="case-overview">
          <h3>案件总览</h3>
          <p className="section-desc">
            第 {currentCase?.reexaminationRound ?? 1} 轮复审 · 已上传 {documents.length} 份文件
          </p>

          <div className="overview-grid">
            {/* Documents by role */}
            {ROLE_ORDER.map((role) => {
              const roleDocs = documents.filter((d) => d.role === role);
              if (roleDocs.length === 0) return null;
              return (
                <div key={role} className="overview-card">
                  <span className="overview-card__icon">{ROLE_META[role].icon}</span>
                  <div className="overview-card__body">
                    <span className="overview-card__label">
                      {ROLE_META[role].label}
                    </span>
                    <span className="overview-card__count">{roleDocs.length} 份</span>
                    <ul className="overview-card__files">
                      {roleDocs.slice(0, 3).map((d) => (
                        <li key={d.id}>
                          {d.fileName}
                          {d.textStatus === "extracted" || d.textStatus === "confirmed"
                            ? " ✓"
                            : d.textStatus === "empty"
                              ? " ⚠"
                              : ""}
                        </li>
                      ))}
                      {roleDocs.length > 3 && (
                        <li className="overview-card__more">… 还有 {roleDocs.length - 3} 份</li>
                      )}
                    </ul>
                  </div>
                </div>
              );
            })}

            {/* Claims summary */}
            {(() => {
              const caseClaimNodes = claimNodes.filter((n) => n.caseId === caseId);
              if (caseClaimNodes.length === 0) return null;
              const amended = (currentCase?.textVersion ?? "original") !== "original";
              return (
                <div className="overview-card">
                  <span className="overview-card__icon">📝</span>
                  <div className="overview-card__body">
                    <span className="overview-card__label">权利要求</span>
                    <span className="overview-card__count">
                      {caseClaimNodes.length} 项
                      {amended && <span className="overview-tag overview-tag--amended">已修改</span>}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* References summary */}
            {(() => {
              const caseRefs = references.filter((r) => r.caseId === caseId);
              if (caseRefs.length === 0) return null;
              return (
                <div className="overview-card">
                  <span className="overview-card__icon">📚</span>
                  <div className="overview-card__body">
                    <span className="overview-card__label">对比文件</span>
                    <span className="overview-card__count">{caseRefs.length} 篇</span>
                    <ul className="overview-card__files">
                      {caseRefs.slice(0, 3).map((r) => (
                        <li key={r.id}>{r.publicationNumber ?? r.fileName}</li>
                      ))}
                      {caseRefs.length > 3 && (
                        <li className="overview-card__more">… 还有 {caseRefs.length - 3} 篇</li>
                      )}
                    </ul>
                  </div>
                </div>
              );
            })()}
          </div>
        </section>
      )}

      {/* Case baseline form */}
      <section className="setup-section">
        <div className="setup-section__header">
          <h3>案件基本信息</h3>
          {documents.some((d) => d.role === "application") && (
            <button
              type="button"
              className="btn-ai-extract"
              disabled={extractingFields}
              onClick={handleAiExtract}
              data-testid="btn-ai-extract"
            >
              {extractingFields ? (
                <><span className="spinner" />提取中…</>
              ) : (
                <><span className="icon-ai" />AI 提取</>
              )}
            </button>
          )}
        </div>
        {extractError && <ErrorBanner error={extractError} data-testid="extract-error" />}
        <p className="section-desc">
          上传申请文件后点击「AI 提取」自动填充，可手动修正
        </p>
        <form onSubmit={handleSubmit(() => {})} noValidate className="case-form">
          <div className="case-form-grid">
            <div className="form-field">
              <label htmlFor="title">发明名称 * {renderFieldHint("title")}</label>
              <input id="title" data-testid="input-title" {...register("title", { validate: validateTitle })} maxLength={120} />
              {errors.title && <span className="form-error">{errors.title.message}</span>}
            </div>

            <div className="form-field">
              <label htmlFor="applicationNumber">申请号 {renderFieldHint("applicationNumber")}</label>
              <input id="applicationNumber" data-testid="input-application-number" {...register("applicationNumber", { validate: validateAppNumber })} />
              {errors.applicationNumber && <span className="form-error">{errors.applicationNumber.message}</span>}
            </div>

            <div className="form-field">
              <label htmlFor="applicant">申请人 {renderFieldHint("applicant")}</label>
              <input id="applicant" data-testid="input-applicant" {...register("applicant")} maxLength={120} />
              {errors.applicant && <span className="form-error">{errors.applicant.message}</span>}
            </div>

            <div className="form-field">
              <label htmlFor="applicationDate">申请日 * {renderFieldHint("applicationDate")}</label>
              <input id="applicationDate" data-testid="input-application-date" type="date" {...register("applicationDate", { validate: validateAppDate })} />
              {errors.applicationDate && <span className="form-error">{errors.applicationDate.message}</span>}
            </div>

            <div className="form-field">
              <label htmlFor="priorityDate">优先权日 {renderFieldHint("priorityDate")}</label>
              <input id="priorityDate" data-testid="input-priority-date" type="date" {...register("priorityDate", { validate: validatePriorityDate })} />
              {errors.priorityDate && <span className="form-error">{errors.priorityDate.message}</span>}
            </div>

            <div className="form-field">
              <label htmlFor="targetClaimNumber">目标权利要求 * {renderFieldHint("targetClaimNumber")}</label>
              <input id="targetClaimNumber" data-testid="input-target-claim" type="number" min={1} {...register("targetClaimNumber", { valueAsNumber: true })} />
              {errors.targetClaimNumber && <span className="form-error">{errors.targetClaimNumber.message}</span>}
            </div>
          </div>

          <div className="form-field case-form-full">
            <label htmlFor="textVersion">审查文本版本 *</label>
            <select id="textVersion" data-testid="input-text-version" {...register("textVersion")}>
              <option value="original">原始文本</option>
              <option value="amended-1">修改文本 1</option>
              <option value="amended-2">修改文本 2</option>
            </select>
          </div>

          <div className="form-field case-form-full">
            <label htmlFor="examinerNotes">审查备注</label>
            <textarea id="examinerNotes" data-testid="input-examiner-notes" {...register("examinerNotes")} maxLength={2000} rows={4} />
            {errors.examinerNotes && <span className="form-error">{errors.examinerNotes.message}</span>}
          </div>
        </form>
      </section>
    </div>
  );
}

async function persistClaims(
  claims: ExtractedFields["claims"],
  setClaimNodes: (nodes: ExtractedFields["claims"]) => void
) {
  if (claims.length === 0) return;
  for (const claim of claims) {
    await createClaimNode(claim);
  }
  setClaimNodes(claims);
}

function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : "";
}
