import { useState } from "react";
import { ConfirmModal } from "./ConfirmModal";

interface ModeSwitchModalProps {
  isOpen: boolean;
  currentMode: "mock" | "real";
  hasProviders: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ModeSwitchModal({
  isOpen,
  currentMode,
  hasProviders,
  onConfirm,
  onCancel
}: ModeSwitchModalProps) {
  const [agreed, setAgreed] = useState(false);
  const targetMode = currentMode === "mock" ? "real" : "mock";

  return (
    <ConfirmModal
      isOpen={isOpen}
      title={targetMode === "real" ? "切换到真实模式" : "切换到演示模式"}
      confirmLabel="确认切换"
      confirmDisabled={targetMode === "real" && (!agreed || !hasProviders)}
      onConfirm={onConfirm}
      onCancel={() => {
        setAgreed(false);
        onCancel();
      }}
      testId="modal-mode-switch"
    >
      {targetMode === "real" ? (
        <div className="mode-switch-content">
          <p className="warning">
            切换到真实模式后，AI 分析请求将发送至外部 AI 服务。请知悉以下合规风险：
          </p>
          <ul>
            <li>案件数据将被发送至第三方 AI 服务</li>
            <li>AI 输出不构成法律结论，仅供参考</li>
            <li>请确保已获得数据外发的授权</li>
          </ul>
          {!hasProviders && (
            <p className="error" data-testid="mode-switch-no-providers">
              请先在设置中配置模型连接。
            </p>
          )}
          <label className="agreement-label">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              data-testid="mode-switch-agree"
            />
            我已了解上述风险并同意切换
          </label>
        </div>
      ) : (
        <div className="mode-switch-content">
          <p>切换到演示模式后，所有 AI 分析将使用预置数据，不会发送任何外部请求。</p>
        </div>
      )}
    </ConfirmModal>
  );
}
