import type { ReferenceDocument } from "@shared/types/domain";

interface ReferenceEditFormProps {
  reference: ReferenceDocument;
  onChange: (updated: ReferenceDocument) => void;
  onDelete: () => void;
}

export function ReferenceEditForm({ reference, onChange, onDelete }: ReferenceEditFormProps) {
  const update = (field: keyof ReferenceDocument, value: string) => {
    onChange({ ...reference, [field]: value });
  };

  return (
    <div className="reference-edit-form" data-testid={`ref-edit-${reference.id}`}>
      <div className="form-field">
        <label>文件名</label>
        <span>{reference.fileName}</span>
      </div>

      <div className="form-field">
        <label htmlFor={`title-${reference.id}`}>文献标题</label>
        <input
          id={`title-${reference.id}`}
          value={reference.title ?? ""}
          onChange={(e) => update("title", e.target.value)}
          data-testid={`input-ref-title-${reference.id}`}
        />
      </div>

      <div className="form-field">
        <label htmlFor={`pubNumber-${reference.id}`}>公开号</label>
        <input
          id={`pubNumber-${reference.id}`}
          value={reference.publicationNumber ?? ""}
          onChange={(e) => update("publicationNumber", e.target.value)}
          data-testid={`input-ref-pub-number-${reference.id}`}
        />
      </div>

      <div className="form-field">
        <label htmlFor={`pubDate-${reference.id}`}>公开日</label>
        <input
          id={`pubDate-${reference.id}`}
          type="date"
          value={reference.publicationDate ?? ""}
          onChange={(e) => update("publicationDate", e.target.value)}
          data-testid={`input-ref-pub-date-${reference.id}`}
        />
      </div>

      <button
        type="button"
        onClick={onDelete}
        data-testid={`btn-delete-ref-${reference.id}`}
      >
        删除
      </button>
    </div>
  );
}
