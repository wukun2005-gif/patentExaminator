import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface Step {
  title: string;
  content: string;
  action?: { label: string; path: string };
}

const STEPS: Step[] = [
  {
    title: "欢迎使用专利审查助手",
    content: "本工具辅助发明专利实质审查，所有 AI 输出为候选事实整理，需审查员确认。接下来带你走一遍完整流程。"
  },
  {
    title: "第一步：创建案件",
    content: "点击「新建案件」创建一个专利审查案件，填写申请号、发明名称、申请日等基本信息。你也可以直接加载预置案例快速体验。"
  },
  {
    title: "第二步：导入文档",
    content: "上传专利申请文件（PDF/DOCX/TXT），系统会自动解析文本。如果是扫描件，会触发 OCR 识别。"
  },
  {
    title: "第三步：添加对比文件",
    content: "在「文献清单」中导入对比文件（现有技术），系统会自动提取公开日期并校验时间轴。"
  },
  {
    title: "第四步：生成 Claim Chart",
    content: "AI 将权利要求拆解为技术特征（A、B、C…），每个特征关联说明书段落。你可以编辑特征描述。"
  },
  {
    title: "第五步：新颖性分析",
    content: "选择对比文件，AI 逐特征判断是否被公开（已明确公开/可能公开/未找到）。区别特征会自动标记。"
  },
  {
    title: "第六步：创造性分析",
    content: "基于三步法：确定最近现有技术→识别区别特征→判断技术启示。AI 给出「可能缺乏创造性」等初步判断。"
  },
  {
    title: "第七步：导出",
    content: "将审查辅助材料导出为 HTML 或 Markdown，包含案件基线、Claim Chart、新颖性对照等完整内容。"
  },
  {
    title: "演示模式 vs 真实模式",
    content: "当前为演示模式，所有 AI 输出为预置示例。配置 API Key 后，可通过顶部开关切换到真实模式，调用大模型。"
  }
];

interface OnboardingGuideProps {
  onClose: () => void;
}

export function OnboardingGuide({ onClose }: OnboardingGuideProps) {
  const [current, setCurrent] = useState(0);
  const navigate = useNavigate();
  const step = STEPS[current]!;

  const handleNext = () => {
    if (current < STEPS.length - 1) {
      setCurrent(current + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (current > 0) setCurrent(current - 1);
  };

  return (
    <div className="onboarding-overlay" data-testid="onboarding-guide">
      <div className="onboarding-card">
        <div className="onboarding-progress">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`onboarding-dot ${i === current ? "onboarding-dot--active" : ""} ${i < current ? "onboarding-dot--done" : ""}`}
            />
          ))}
        </div>

        <h3>{step.title}</h3>
        <p>{step.content}</p>

        <div className="onboarding-actions">
          <span className="onboarding-step-count">
            {current + 1} / {STEPS.length}
          </span>
          <div className="onboarding-buttons">
            {current > 0 && (
              <button type="button" className="btn-text" onClick={handlePrev}>
                上一步
              </button>
            )}
            <button type="button" onClick={handleNext} data-testid="btn-onboarding-next">
              {current < STEPS.length - 1 ? "下一步" : "开始使用"}
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
