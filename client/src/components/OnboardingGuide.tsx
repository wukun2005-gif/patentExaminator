import { useState } from "react";
import { router } from "../router";
import { loadPresetCase } from "../lib/presetLoader";

interface Step {
  title: string;
  content: string;
  sampleFile?: string;
  sampleLabel?: string;
  prefill?: Record<string, string>;
  action?: { label: string; path: string };
  tip?: string;
}

const SAMPLE_BASE = "samples";

const QUICK_STEPS: Step[] = [
  {
    title: "快速体验：加载预置案例",
    content:
      "点击下方按钮，系统会自动加载一个完整的 LED 散热装置审查案例（所有数据已填充完毕），直接体验从案件信息到导出的全流程。"
  },
  {
    title: "浏览各功能页面",
    content:
      "加载完成后，左侧导航栏可以切换：案件基本信息 → 文档导入 → 文献清单 → 文档解读 → Claim Chart → 新颖性对照 → 创造性分析 → 形式缺陷 → 导出。每个页面都有对应的预置数据。"
  },
  {
    title: "切换模式",
    content:
      "顶部模式横幅可以切换「演示模式」和「真实模式」。演示模式下 AI 输出为预置示例；真实模式会调用 Google AI Studio (Gemini) 免费 API 生成结果，无需额外配置。"
  }
];

const GUIDE_STEPS: Step[] = [
  {
    title: "第1步：新建案件并填写基本信息",
    content:
      "点击「新建案件」→「创建新案件」，进入案件基本信息表单。按右侧提示填写字段。",
    prefill: {
      发明名称: "一种基于相变材料的LED散热模组",
      申请日: "2024-03-15",
      申请号: "202410567890.1",
      申请人: "深圳光明科技有限公司",
      目标权利要求: "1",
      文本版本: "original"
    },
    tip: "申请号和申请人可以自编，不影响审查流程。目标权利要求填1表示审查权利要求1。"
  },
  {
    title: "第2步：上传申请文件",
    content:
      "进入左侧导航「文档导入」页面，点击文件选择器上传下方的申请文件。系统会自动读取全文、建立段落索引、解析权利要求。",
    sampleFile: `${SAMPLE_BASE}/01-专利申请文件/led-heatsink/申请文件.pdf`,
    sampleLabel: "申请文件 - LED散热模组",
    tip: "实际专利申请中，说明书和权利要求书合为一个文件提交。权利要求书是文件末尾的一个章节，系统会自动提取并解析。"
  },
  {
    title: "第3步：确认提取的文本",
    content:
      "上传后系统显示提取的文本，检查段落编号（[0001]、[0002]…）是否连续、权利要求是否完整解析。确认后进入下一步。",
    tip: "如果文本有缺漏，可以手动编辑后重新确认。"
  },
  {
    title: "第4步：添加对比文件1（中文）",
    content:
      "进入左侧导航「文献清单」页面，点击上传按钮添加第一份对比文件。上传后填写公开号和公开日。",
    sampleFile: `${SAMPLE_BASE}/02-对比文件/CN108XXXXXXA-散热器.pdf`,
    sampleLabel: "对比文件1 - CN108XXXXXXA 散热器",
    prefill: {
      标题: "一种散热器",
      公开号: "CN108XXXXXXA",
      公开日: "2022-06-15"
    },
    tip: "公开日必须早于申请日（2024-03-15），否则系统会标记为「不可用」。"
  },
  {
    title: "第5步：添加对比文件2（英文）",
    content: "继续在「文献清单」中添加第二份对比文件。",
    sampleFile: `${SAMPLE_BASE}/02-对比文件/US20230000XXXA1-热管理.pdf`,
    sampleLabel: "对比文件2 - US2023/0000XXXA1 热管理装置",
    prefill: {
      标题: "Thermal Management Device for Semiconductor Light Sources",
      公开号: "US2023/0000XXXA1",
      公开日: "2023-01-15"
    },
    tip: "英文对比文件也可以正常解析。系统会自动判断时间线状态。"
  },
  {
    title: "第6步：文档解读",
    content:
      "进入左侧导航「文档解读」页面，AI 会自动解读申请文件，用通俗语言说明技术领域、核心技术方案、主要权利要求。你也可以在下方对话框追问细节。",
    tip: "文档解读是可选步骤，不影响后续分析。"
  },
  {
    title: "第7步：生成 Claim Chart（特征分解）",
    content:
      "进入左侧导航「Claim Chart」页面，选择要分析的权利要求（默认为权利要求1），点击「生成特征分解」按钮。系统会将权利要求拆解为技术特征 A、B、C…，每个特征关联说明书段落。",
    tip: "在演示模式下，特征分解为预置示例。真实模式下由 AI 自动拆解。"
  },
  {
    title: "第8步：新颖性分析",
    content:
      "进入左侧导航「新颖性对照」页面，选择对比文件1，点击「运行新颖性分析」。系统逐个特征判断对比文件是否公开（已明确公开/可能公开/未找到），自动标记差异特征。",
    tip: "差异特征（如一体成型、纳米涂层）是后续创造性分析的基础。"
  },
  {
    title: "第9步：创造性分析（三步法）",
    content:
      "进入左侧导航「创造性分析」页面，点击「运行创造性分析」。系统按三步法分析：确定最近似现有技术 → 识别区别特征 → 判断是否有技术启示 → 给出初步结论。",
    tip: "AI 结论仅为候选，审查员需结合对比文件全文独立判断。"
  },
  {
    title: "第10步：形式缺陷检测",
    content:
      "进入左侧导航「形式缺陷」页面，点击「运行缺陷检测」。AI 扫描权利要求引用关系、说明书支持性、摘要字数等形式问题。",
    tip: "缺陷检测结果以清单展示，可逐条确认或忽略。"
  },
  {
    title: "第11步：导出审查报告",
    content:
      "进入左侧导航「导出」页面，选择 HTML 或 Markdown 格式，点击导出。报告包含案件信息、Claim Chart、新颖性对照、创造性分析、缺陷清单等完整内容。",
    tip: "导出的报告可以作为审查意见初稿的参考材料。"
  },
  {
    title: "完成！",
    content:
      "你已经走完了完整的专利审查辅助流程。实际使用时，你可以用自己的专利申请文件替换 sample 文件，流程完全一样。\n\n点击顶部「引导」按钮可以随时重新查看本引导。"
  }
];

interface OnboardingGuideProps {
  onClose: () => void;
}

export function OnboardingGuide({ onClose }: OnboardingGuideProps) {
  const [mode, setMode] = useState<"choose" | "quick" | "guide">("choose");
  const [current, setCurrent] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  const steps = mode === "quick" ? QUICK_STEPS : GUIDE_STEPS;
  const step = steps[current]!;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const handleNext = () => {
    if (current < steps.length - 1) {
      setCurrent(current + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (current > 0) setCurrent(current - 1);
  };

  const handleLoadPreset = async () => {
    const caseId = await loadPresetCase();
    onClose();
    router.navigate(`/cases/${caseId}/baseline`);
  };

  // Mode selection screen
  if (mode === "choose") {
    return (
      <div className="onboarding-overlay" data-testid="onboarding-guide">
        <div className="onboarding-card onboarding-card--wide">
          <button
            type="button"
            className="onboarding-close"
            onClick={onClose}
            aria-label="关闭引导"
          >
            &times;
          </button>
          <h3>欢迎使用专利审查助手</h3>
          <p>选择一种方式开始体验：</p>
          <div className="onboarding-choose">
            <button
              type="button"
              className="onboarding-choose-card"
              onClick={handleLoadPreset}
              data-testid="btn-quick-preset"
            >
              <span className="onboarding-choose-icon">⚡</span>
              <span className="onboarding-choose-title">快速体验</span>
              <span className="onboarding-choose-desc">
                一键加载预置案例，所有数据已填充，直接浏览各功能页面。
              </span>
            </button>
            <button
              type="button"
              className="onboarding-choose-card"
              onClick={() => setMode("guide")}
              data-testid="btn-sample-guide"
            >
              <span className="onboarding-choose-icon">📋</span>
              <span className="onboarding-choose-title">Sample 引导</span>
              <span className="onboarding-choose-desc">
                按步骤引导你用 sample 文件走完整流程，了解每一步做什么、用什么文件。
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-overlay" data-testid="onboarding-guide">
      <div className="onboarding-card onboarding-card--wide">
        <div className="onboarding-progress">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`onboarding-dot ${i === current ? "onboarding-dot--active" : ""} ${i < current ? "onboarding-dot--done" : ""}`}
            />
          ))}
        </div>

        <h3>{step.title}</h3>
        <p style={{ whiteSpace: "pre-line" }}>{step.content}</p>

        {/* Sample file card */}
        {step.sampleFile && (
          <div className="onboarding-sample">
            <div className="onboarding-sample-label">
              {step.sampleLabel ?? "Sample 文件"}
            </div>
            <div className="onboarding-sample-path">
              <code>{step.sampleFile}</code>
              <button
                type="button"
                className="onboarding-sample-copy"
                onClick={() => handleCopy(step.sampleFile!)}
              >
                {copied === step.sampleFile ? "已复制 ✓" : "复制路径"}
              </button>
            </div>
          </div>
        )}

        {/* Prefill data card */}
        {step.prefill && (
          <div className="onboarding-prefill">
            <div className="onboarding-prefill-title">填写以下字段：</div>
            {Object.entries(step.prefill).map(([key, value]) => (
              <div key={key} className="onboarding-prefill-row">
                <span className="onboarding-prefill-key">{key}</span>
                <span className="onboarding-prefill-value">
                  {value}
                  <button
                    type="button"
                    className="onboarding-sample-copy"
                    onClick={() => handleCopy(value)}
                  >
                    {copied === value ? "✓" : "复制"}
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tip */}
        {step.tip && (
          <div className="onboarding-tip">
            <span className="onboarding-tip-icon">💡</span>
            {step.tip}
          </div>
        )}

        <div className="onboarding-actions">
          <span className="onboarding-step-count">
            {current + 1} / {steps.length}
          </span>
          <div className="onboarding-buttons">
            <button
              type="button"
              className="btn-text"
              onClick={() => {
                setMode("choose");
                setCurrent(0);
              }}
            >
              切换模式
            </button>
            {current > 0 && (
              <button type="button" className="btn-text" onClick={handlePrev}>
                上一步
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              data-testid="btn-onboarding-next"
            >
              {current < steps.length - 1 ? "下一步" : "开始使用"}
            </button>
          </div>
        </div>

        <button
          type="button"
          className="onboarding-close"
          onClick={onClose}
          aria-label="关闭引导"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
