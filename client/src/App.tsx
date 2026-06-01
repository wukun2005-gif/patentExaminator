import { useEffect, useState, useCallback } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { useSettingsStore } from "./store";
import { OnboardingGuide } from "./components/OnboardingGuide";
import { createLogger } from "./lib/logger";
import { syncWithServer } from "./lib/syncClient";

const log = createLogger("App");

const ONBOARDING_KEY = "patent-examiner-onboarding-done";

export function App() {
  const loadFromDb = useSettingsStore((s) => s.loadFromDb);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    loadFromDb().catch((e) => log("Settings load failed:", e));

    // B-025: App 启动时自动同步
    syncWithServer()
      .then((result) => {
        if (result.ok) {
          log(`Auto-sync complete: uploaded ${result.uploaded}, downloaded ${result.downloaded}`);
        } else {
          log(`Auto-sync failed: ${result.error}`);
        }
      })
      .catch((err) => log("Auto-sync error:", err));

    const done = localStorage.getItem(ONBOARDING_KEY);
    if (!done) setShowOnboarding(true);
  }, [loadFromDb]);

  useEffect(() => {
    const handler = () => setShowOnboarding(true);
    window.addEventListener("show-onboarding", handler);
    return () => window.removeEventListener("show-onboarding", handler);
  }, []);

  const handleCloseOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    setShowOnboarding(false);
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      {showOnboarding && <OnboardingGuide onClose={handleCloseOnboarding} />}
    </>
  );
}
