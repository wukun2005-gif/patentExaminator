import { ConfirmModal } from "./ConfirmModal";

interface ExternalSendConfirmProps {
  isOpen: boolean;
  provider: string;
  modelId: string;
  tokenEstimate: number;
  fieldSummary: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ExternalSendConfirm({
  isOpen,
  provider,
  modelId,
  tokenEstimate,
  fieldSummary,
  onConfirm,
  onCancel
}: ExternalSendConfirmProps) {
  return (
    <ConfirmModal
      isOpen={isOpen}
      title="外发确认"
      confirmLabel="确认发送"
      cancelLabel="取消"
      onConfirm={onConfirm}
      onCancel={onCancel}
      testId="modal-external-send"
    >
      <div className="external-send-details">
        <p>即将向外部 AI 服务发送数据，请确认以下信息：</p>
        <table>
          <tbody>
            <tr>
              <td><strong>Provider</strong></td>
              <td>{provider}</td>
            </tr>
            <tr>
              <td><strong>Model</strong></td>
              <td>{modelId}</td>
            </tr>
            <tr>
              <td><strong>估算 Token</strong></td>
              <td>{tokenEstimate.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
        <div className="field-summary">
          <h4>发送内容摘要</h4>
          <pre>{fieldSummary}</pre>
        </div>
        <p className="warning">
          注意：数据将发送至外部服务，请确保不包含敏感信息。
        </p>
      </div>
    </ConfirmModal>
  );
}
