import { useEffect, useState, useCallback } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { useSettingsStore } from "./store";
import { OnboardingGuide } from "./components/OnboardingGuide";

const ONBOARDING_KEY = "patent-examiner-onboarding-done";

export function App() {
  const loadFromDb = useSettingsStore((s) => s.loadFromDb);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    loadFromDb();
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
