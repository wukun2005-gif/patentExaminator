import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { SourceDocument } from "@shared/types/domain";
import { extractPdfText } from "../../lib/pdfText";
import { extractDocxText } from "../../lib/docxText";
import { extractHtmlText } from "../../lib/htmlText";
import { buildTextIndex } from "../../lib/textIndex";
import { computeFileHash } from "../../lib/fileHash";
import { createDocument } from "../../lib/repositories/documentRepo";
import { useDocumentsStore } from "../../store";

const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".html"];

export function DocumentUploadPanel() {
  const { caseId } = useParams<{ caseId: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string>("");
  const { addDocument } = useDocumentsStore();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !caseId) return;

    for (const file of Array.from(files)) {
      const ext = getFileExtension(file.name);
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        setStatus(`不支持的文件格式: ${ext}`);
        continue;
      }

      setStatus(`正在处理: ${file.name}`);

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
          role: "application",
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
        setStatus(`${file.name} 处理完成`);
      } catch (err) {
        setStatus(`处理 ${file.name} 时出错: ${err}`);
      }
    }
  };

  return (
    <div className="document-upload-panel" data-testid="page-documents">
      <h2>申请文件</h2>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt,.html"
        multiple
        onChange={handleFileChange}
        data-testid="input-file-upload"
      />
      {status && <p className="upload-status" data-testid="upload-status">{status}</p>}
    </div>
  );
}

function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : "";
}
