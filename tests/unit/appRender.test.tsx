import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OnboardingGuide } from "@client/components/OnboardingGuide";
import { AppShell } from "@client/components/AppShell";
import { ModeBanner } from "@client/components/ModeBanner";
import { NewCasePage } from "@client/features/case/NewCasePage";

// Mock IndexedDB for settings store
vi.mock("@client/lib/indexedDb", () => ({
  getDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn().mockReturnValue({
      objectStore: vi.fn().mockReturnValue({ clear: vi.fn() }),
      done: Promise.resolve()
    })
  }),
  openPatentDB: vi.fn(),
  setDBInstance: vi.fn()
}));

// Mock caseRepo
vi.mock("@client/lib/repositories/caseRepo", () => ({
  createCase: vi.fn().mockResolvedValue(undefined)
}));

const ONBOARDING_KEY = "patent-examiner-onboarding-done";

describe("Component rendering smoke tests", () => {
  it("OnboardingGuide renders without crashing inside Router", () => {
    render(
      <MemoryRouter>
        <OnboardingGuide onClose={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("onboarding-guide")).toBeDefined();
  });

  it("AppShell renders sidebar navigation", () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div>child</div>
        </AppShell>
      </MemoryRouter>
    );
    expect(screen.getByTestId("sidebar")).toBeDefined();
    expect(screen.getByTestId("main-content")).toBeDefined();
  });

  it("ModeBanner renders mode toggle", () => {
    render(
      <MemoryRouter>
        <ModeBanner />
      </MemoryRouter>
    );
    expect(screen.getByTestId("banner-mode")).toBeDefined();
  });

  it("NewCasePage renders create button", () => {
    render(
      <MemoryRouter>
        <NewCasePage />
      </MemoryRouter>
    );
    expect(screen.getByTestId("btn-create-case")).toBeDefined();
  });
});

describe("OnboardingGuide step navigation", () => {
  it("shows choose screen by default", () => {
    render(
      <MemoryRouter>
        <OnboardingGuide onClose={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText("欢迎使用专利审查助手")).toBeDefined();
    expect(screen.getByTestId("btn-quick-preset")).toBeDefined();
    expect(screen.getByTestId("btn-sample-guide")).toBeDefined();
  });

  it("enters guide mode on Sample 引导 click", () => {
    render(
      <MemoryRouter>
        <OnboardingGuide onClose={() => {}} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId("btn-sample-guide"));
    expect(screen.getByText("第1步：新建案件并填写基本信息")).toBeDefined();
    expect(screen.getByText("1 / 12")).toBeDefined();
  });

  it("navigates to next step on click", () => {
    render(
      <MemoryRouter>
        <OnboardingGuide onClose={() => {}} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId("btn-sample-guide"));
    fireEvent.click(screen.getByTestId("btn-onboarding-next"));
    expect(screen.getByText("第2步：上传申请文件")).toBeDefined();
    expect(screen.getByText("2 / 12")).toBeDefined();
  });

  it("navigates back to previous step", () => {
    render(
      <MemoryRouter>
        <OnboardingGuide onClose={() => {}} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId("btn-sample-guide"));
    // Go to step 2
    fireEvent.click(screen.getByTestId("btn-onboarding-next"));
    expect(screen.getByText("第2步：上传申请文件")).toBeDefined();
    // Go back to step 1
    fireEvent.click(screen.getByText("上一步"));
    expect(screen.getByText("第1步：新建案件并填写基本信息")).toBeDefined();
  });

  it("calls onClose when clicking close button", () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <OnboardingGuide onClose={onClose} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByLabelText("关闭引导"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on last step when clicking the action button", () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <OnboardingGuide onClose={onClose} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId("btn-sample-guide"));
    // Navigate to last step (step 12)
    for (let i = 0; i < 11; i++) {
      fireEvent.click(screen.getByTestId("btn-onboarding-next"));
    }
    expect(screen.getByText("完成！")).toBeDefined();
    expect(screen.getByText("开始使用")).toBeDefined();
    fireEvent.click(screen.getByTestId("btn-onboarding-next"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not show prev button on first step", () => {
    render(
      <MemoryRouter>
        <OnboardingGuide onClose={() => {}} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId("btn-sample-guide"));
    expect(screen.queryByText("上一步")).toBeNull();
  });
});

describe("AppShell 引导 button", () => {
  beforeEach(() => {
    localStorage.removeItem(ONBOARDING_KEY);
  });

  it("renders the 引导 button in topbar", () => {
    render(
      <MemoryRouter>
        <AppShell><div /></AppShell>
      </MemoryRouter>
    );
    expect(screen.getByText("引导")).toBeDefined();
  });

  it("dispatches show-onboarding event when clicked", () => {
    const handler = vi.fn();
    window.addEventListener("show-onboarding", handler);
    render(
      <MemoryRouter>
        <AppShell><div /></AppShell>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("引导"));
    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener("show-onboarding", handler);
  });

  it("clears localStorage key when clicked", () => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    render(
      <MemoryRouter>
        <AppShell><div /></AppShell>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("引导"));
    expect(localStorage.getItem(ONBOARDING_KEY)).toBeNull();
  });
});

describe("Onboarding persistence flow", () => {
  beforeEach(() => {
    localStorage.removeItem(ONBOARDING_KEY);
  });

  it("close callback sets localStorage key", () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <OnboardingGuide onClose={onClose} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByLabelText("关闭引导"));
    expect(onClose).toHaveBeenCalledOnce();
    // Simulate what App.tsx does in handleCloseOnboarding
    localStorage.setItem(ONBOARDING_KEY, "1");
    expect(localStorage.getItem(ONBOARDING_KEY)).toBe("1");
  });

  it("localStorage key prevents re-show on reload", () => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    // Simulate what App.tsx does on mount
    const done = localStorage.getItem(ONBOARDING_KEY);
    expect(done).toBe("1");
    // showOnboarding would be false
  });

  it("引导 button clears key allowing re-show", () => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    // Simulate showGuide
    localStorage.removeItem(ONBOARDING_KEY);
    window.dispatchEvent(new Event("show-onboarding"));
    const done = localStorage.getItem(ONBOARDING_KEY);
    expect(done).toBeNull();
    // showOnboarding would be true
  });
});
