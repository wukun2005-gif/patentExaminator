import { useState } from "react";
import { useSettingsStore } from "../store/features/settings/settingsSlice";
import { ModeSwitchModal } from "./ModeSwitchModal";

export function ModeBanner() {
  const { settings, updateMode } = useSettingsStore();
  const mode = settings.mode;
  const [showModal, setShowModal] = useState(false);

  const hasProviders = settings.providers.some((p) => p.enabled);

  const handleToggle = () => {
    setShowModal(true);
  };

  const handleConfirm = () => {
    updateMode(mode === "mock" ? "real" : "mock");
    setShowModal(false);
  };

  return (
    <>
      <div className="mode-toggle" data-testid="banner-mode">
        <span className={`mode-toggle__label ${mode === "mock" ? "mode-toggle__label--active" : ""}`}>
          演示
        </span>
        <button
          type="button"
          className={`mode-toggle__switch ${mode === "real" ? "mode-toggle__switch--on" : ""}`}
          onClick={handleToggle}
          aria-label={mode === "mock" ? "切换到真实模式" : "切换到演示模式"}
          title={mode === "mock" ? "当前：演示模式（点击切换）" : "当前：真实模式（点击切换）"}
        >
          <span className="mode-toggle__knob" />
        </button>
        <span className={`mode-toggle__label ${mode === "real" ? "mode-toggle__label--active" : ""}`}>
          真实
        </span>
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
