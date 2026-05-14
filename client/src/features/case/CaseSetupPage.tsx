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
import { createDocument, readDocumentsByCaseId } from "../../lib/repositories/documentRepo";
import { createClaimNode } from "../../lib/repositories/claimRepo";
import { readCaseById, createCase, updateCase } from "../../lib/repositories/caseRepo";
import { useCaseStore, useDocumentsStore, useClaimsStore, useSettingsStore, useReferencesStore } from "../../store";
import { AgentClient } from "../../agent/AgentClient";

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
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fileStatuses, setFileStatuses] = useState<Record<string, string>>({});
  const [extracted, setExtracted] = useState<ExtractedFields | null>(null);
  const [extractingFields, setExtractingFields] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [uploadRole, setUploadRole] = useState<SourceDocument["role"]>("application");

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
        <h3>上传复审文件</h3>
        <p className="section-desc">
          支持 PDF、DOCX、TXT、HTML 格式，单类可批量上传
        </p>

        <div className="file-role-grid">
          {ROLE_ORDER.map((role) => {
            const roleDocs = documents.filter((d) => d.role === role);
            const processingEntries = Object.entries(fileStatuses).filter(
              ([name]) => !documents.some((d) => d.fileName === name)
            );
            const isCurrentRoleProcessing =
              uploadRole === role && processingEntries.length > 0;

            return (
              <div key={role} className="file-role-card" data-testid={`role-card-${role}`}>
                <div className="file-role-card__header">
                  <span className="file-role-card__icon">{ROLE_META[role].icon}</span>
                  <span className="file-role-card__label">{ROLE_META[role].label}</span>
                  {roleDocs.length > 0 && (
                    <span className="file-role-card__count">{roleDocs.length}</span>
                  )}
                </div>
                <div className="file-role-card__body">
                  {roleDocs.length === 0 && !isCurrentRoleProcessing && (
                    <span className="file-role-empty">暂无文件</span>
                  )}
                  {roleDocs.map((doc) => (
                    <div key={doc.id} className="file-role-file">
                      <span className="file-role-file__name">{doc.fileName}</span>
                      <span className="file-role-file__badge">已导入</span>
                    </div>
                  ))}
                  {isCurrentRoleProcessing &&
                    processingEntries.map(([name, status]) => (
                      <div key={name} className="file-role-file file-role-file--processing">
                        <span className="file-role-file__name">{name}</span>
                        <span className={`file-role-file__badge ${
                          status === "完成" ? "file-badge-ok" : status === "处理中..." ? "file-badge-processing" : "file-badge-error"
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
        {extractError && (
          <p className="extract-error" data-testid="extract-error">{extractError}</p>
        )}
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
