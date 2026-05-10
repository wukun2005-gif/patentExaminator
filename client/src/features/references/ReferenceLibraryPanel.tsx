import { useState } from "react";
import { useParams } from "react-router-dom";
import type { ReferenceDocument } from "@shared/types/domain";
import { classifyReferenceDate } from "../../lib/dateRules";
import { TimelineStatusBadge } from "../../components/TimelineStatusBadge";
import { ReferenceEditForm } from "./ReferenceEditForm";
import { useReferencesStore, useCaseStore } from "../../store";
import { createDocument, deleteDocument } from "../../lib/repositories/documentRepo";

const MAX_REFERENCES = 10;

export function ReferenceLibraryPanel() {
  const { caseId } = useParams<{ caseId: string }>();
  const { references, addReference, updateReference, removeReference } =
    useReferencesStore();
  const { currentCase } = useCaseStore();
  const [limitWarning, setLimitWarning] = useState("");

  const baselineDate = currentCase?.priorityDate ?? currentCase?.applicationDate;

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
      const ref: ReferenceDocument = {
        id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        caseId: caseId ?? "",
        role: "reference",
        fileName: file.name,
        fileType: getFileExtension(file.name) as ReferenceDocument["fileType"],
        textStatus: "empty",
        extractedText: "",
        textIndex: { pages: [], paragraphs: [], lineMap: [] },
        publicationDateConfidence: "manual",
        timelineStatus: "needs-publication-date",
        createdAt: new Date().toISOString()
      };
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
      <input
        type="file"
        multiple
        accept=".pdf,.docx,.txt,.html"
        onChange={(e) => e.target.files && handleAddFiles(e.target.files)}
        data-testid="input-ref-upload"
      />
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
  return lastDot >= 0 ? fileName.slice(lastDot + 1).toLowerCase() : "txt";
}
