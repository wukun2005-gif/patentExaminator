import { useState } from "react";
import { useSettingsStore } from "../store/features/settings/settingsSlice";
import { ModeSwitchModal } from "./ModeSwitchModal";

export function ModeBanner() {
  const { settings, updateMode } = useSettingsStore();
  const mode = settings.mode;
  const [showModal, setShowModal] = useState(false);

  const hasProviders = settings.providers.length > 0;

  const handleConfirm = () => {
    updateMode(mode === "mock" ? "real" : "mock");
    setShowModal(false);
  };

  return (
    <>
      <div
        className={`mode-banner mode-banner--${mode}`}
        data-testid="banner-mode"
        role="status"
        aria-label={mode === "mock" ? "演示模式" : "真实模式"}
        onClick={() => setShowModal(true)}
        style={{ cursor: "pointer" }}
        title="点击切换模式"
      >
        {mode === "mock"
          ? "演示模式：AI 输出为预置示例，不消耗 Token"
          : "真实模式：AI 调用将消耗 Token 并联网"}
      </div>

      <ModeSwitchModal
        isOpen={showModal}
        currentMode={mode}
        hasProviders={hasProviders}
        onConfirm={handleConfirm}
        onCancel={() => setShowModal(false)}
      />
    </>
  );
}
