interface DeleteFileDialogProps {
  fileName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteFileDialog({ fileName, onConfirm, onCancel }: DeleteFileDialogProps) {
  return (
    <div className="delete-file-dialog-overlay" data-testid="delete-file-dialog-overlay" onClick={onCancel}>
      <div className="delete-file-dialog" data-testid="delete-file-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>确认删除</h3>
        <p>确定要删除 <strong>{fileName}</strong> 吗？此操作不可撤销。</p>
        <div className="delete-file-dialog__actions">
          <button type="button" onClick={onCancel} data-testid="btn-cancel-delete">
            取消
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm} data-testid="btn-confirm-delete">
            删除
          </button>
        </div>
      </div>
    </div>
  );
}