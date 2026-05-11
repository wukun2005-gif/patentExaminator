import { useState } from "react";
import { useParams } from "react-router-dom";
import type { ReferenceDocument, SourceDocument } from "@shared/types/domain";
import { classifyReferenceDate } from "../../lib/dateRules";
import { extractPdfText } from "../../lib/pdfText";
import { extractDocxText } from "../../lib/docxText";
import { extractHtmlText } from "../../lib/htmlText";
import { buildTextIndex } from "../../lib/textIndex";
import { TimelineStatusBadge } from "../../components/TimelineStatusBadge";
import { ReferenceEditForm } from "./ReferenceEditForm";
import { ReferenceSearchPanel } from "./ReferenceSearchPanel";
import { useReferencesStore, useCaseStore, useClaimsStore } from "../../store";
import { createDocument, deleteDocument } from "../../lib/repositories/documentRepo";

const MAX_REFERENCES = 10;

export function ReferenceLibraryPanel() {
  const { caseId } = useParams<{ caseId: string }>();
  const { references, addReference, updateReference, removeReference } =
    useReferencesStore();
  const { currentCase } = useCaseStore();
  const { claimNodes, claimFeatures } = useClaimsStore();
  const [limitWarning, setLimitWarning] = useState("");

  const baselineDate = currentCase?.priorityDate ?? currentCase?.applicationDate;

  // Get claim text and features for search
  const targetClaim = claimNodes.find((n) => n.claimNumber === currentCase?.targetClaimNumber);
  const claimText = targetClaim?.rawText ?? "";
  const features = claimFeatures.map((f) => ({
    featureCode: f.featureCode,
    description: f.description
  }));

  const handleAddFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const remaining = MAX_REFERENCES - references.length;
    if (remaining <= 0) {
      setLimitWarning(`已达到对比文件数量上限（${MAX_REFERENCES}篇），请合并或分批分析。`);
      return;
    }
    setLimitWarning("");

    const toAdd = fileArray.slice(0, remaining);
    for (const file of toAdd) {
      const ext = getFileExtension(file.name);
      const fileType = ext.replace(".", "") as SourceDocument["fileType"];

      // Extract text based on file type
      let text = "";
      let textStatus: SourceDocument["textStatus"] = "empty";
      let textLayerStatus: SourceDocument["textLayerStatus"] = "unknown";

      try {
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
      } catch {
        textStatus = "empty";
      }

      const textIndex = buildTextIndex(text);
      const meta = parsePatentMeta(text, file.name);

      const ref: ReferenceDocument = {
        id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        caseId: caseId ?? "",
        role: "reference",
        fileName: file.name,
        fileType: fileType as ReferenceDocument["fileType"],
        textLayerStatus,
        textStatus,
        extractedText: text,
        textIndex,
        source: "user-upload",
        publicationDateConfidence: meta.publicationDate ? "medium" : "manual",
        timelineStatus: "needs-publication-date",
        title: meta.title,
        publicationNumber: meta.publicationNumber,
        ...(meta.publicationDate ? { publicationDate: meta.publicationDate } : {}),
        createdAt: new Date().toISOString()
      };

      // Compute timeline status now that we may have a publication date
      const timelineStatus = classifyReferenceDate(
        baselineDate,
        ref.publicationDate,
        ref.publicationDateConfidence
      );
      ref.timelineStatus = timelineStatus;

      await createDocument(ref);
      addReference(ref);
    }
  };

  const handleUpdate = async (updated: ReferenceDocument) => {
    const timelineStatus = classifyReferenceDate(
      baselineDate,
      updated.publicationDate,
      updated.publicationDateConfidence
    );
    const withTimeline = { ...updated, timelineStatus };
    await createDocument(withTimeline); // put = upsert
    updateReference(withTimeline);
  };

  const handleDelete = async (id: string) => {
    await deleteDocument(id);
    removeReference(id);
  };

  return (
    <div className="reference-library-panel" data-testid="page-references">
      <h2>文献清单</h2>
      <p className="ref-count">已添加 {references.length}/{MAX_REFERENCES} 篇</p>
      {limitWarning && (
        <p className="ref-limit-warning" data-testid="ref-limit-warning">
          {limitWarning}
        </p>
      )}

      {/* Manual upload */}
      <div className="ref-upload-section">
        <input
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.html"
          onChange={(e) => e.target.files && handleAddFiles(e.target.files)}
          data-testid="input-ref-upload"
        />
      </div>

      {/* AI search */}
      {claimText && (
        <ReferenceSearchPanel claimText={claimText} features={features} />
      )}

      {/* Confirmed references */}
      <div className="reference-list">
        {references.map((ref) => (
          <div key={ref.id} className="reference-item" data-testid={`ref-item-${ref.id}`}>
            <div className="reference-summary">
              <span>{ref.title ?? ref.fileName}</span>
              <TimelineStatusBadge
                status={ref.timelineStatus}
                dataTestId={`badge-timeline-${ref.id}`}
              />
            </div>
            <ReferenceEditForm
              reference={ref}
              onChange={handleUpdate}
              onDelete={() => handleDelete(ref.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : ".txt";
}

/** Try to extract patent publication number, date, and title from text. */
function parsePatentMeta(text: string, fileName: string) {
  const result: { publicationNumber?: string; publicationDate?: string; title?: string } = {};

  // Publication number: CN patterns (CN1234567A, CN 1234567 B, CN201234567U, etc.)
  // Also covers US, EP, WO, JP, KR patterns
  const pubNumMatch = text.match(
    /(?:公开号|申请号|Publication\s*No\.?|Application\s*No\.?)[:\s]*((?:CN|US|EP|WO|JP|KR)\s*\d[\d\s]*(?:[A-Z]\d?)?)/i
  ) || text.match(/((?:CN|US|EP|WO|JP|KR)\s*\d{5,}[\d\s]*[A-Z]?\d?)/i);
  if (pubNumMatch?.[1]) {
    result.publicationNumber = pubNumMatch[1].replace(/\s+/g, "");
  }

  // Publication date: 公开日/申请日 patterns, or ISO-like dates near patent numbers
  const dateMatch = text.match(
    /(?:公开日|公告日|授权公告日|公开日期|Publication\s*Date)[:\s]*(\d{4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})/i
  );
  if (dateMatch) {
    const [, y, m, d] = dateMatch;
    result.publicationDate = `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }

  // Title: look for 发明名称 or Title field
  const titleMatch = text.match(/(?:发明名称|实用新型名称|Title)[:\s]*([^\n]{2,80})/i);
  if (titleMatch?.[1]) {
    result.title = titleMatch[1].trim().replace(/\s+/g, " ");
  }

  // Fallback: derive title from filename
  if (!result.title) {
    const nameWithoutExt = fileName.replace(/\.[^.]+$/, "");
    result.title = nameWithoutExt.replace(/[_-]+/g, " ").trim();
  }

  return result;
}
