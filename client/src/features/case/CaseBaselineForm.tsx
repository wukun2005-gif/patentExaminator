import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import type { PatentCase } from "@shared/types/domain";
import { readCaseById, createCase, updateCase } from "../../lib/repositories/caseRepo";
import { useCaseStore } from "../../store";

interface CaseFormValues {
  title: string;
  applicationNumber: string;
  applicant: string;
  applicationDate: string;
  priorityDate: string;
  targetClaimNumber: number;
  textVersion: string;
  examinerNotes: string;
}

const DEFAULT_VALUES: CaseFormValues = {
  title: "",
  applicationNumber: "",
  applicant: "",
  applicationDate: "",
  priorityDate: "",
  targetClaimNumber: 1,
  textVersion: "original",
  examinerNotes: ""
};

export function CaseBaselineForm() {
  const { caseId } = useParams<{ caseId: string }>();
  const { currentCase, setCurrentCase } = useCaseStore();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors }
  } = useForm<CaseFormValues>({
    defaultValues: DEFAULT_VALUES,
    mode: "onChange"
  });

  // Load existing case from IndexedDB
  useEffect(() => {
    if (!caseId) return;
    (async () => {
      const existing = await readCaseById(caseId);
      if (existing) {
        setCurrentCase(existing);
        reset({
          title: existing.title ?? "",
          applicationNumber: existing.applicationNumber ?? "",
          applicant: existing.applicant ?? "",
          applicationDate: existing.applicationDate ?? "",
          priorityDate: existing.priorityDate ?? "",
          targetClaimNumber: existing.targetClaimNumber ?? 1,
          textVersion: existing.textVersion ?? "original",
          examinerNotes: existing.examinerNotes ?? ""
        });
      }
    })();
  }, [caseId, reset, setCurrentCase]);

  // Debounced save to IndexedDB (400ms)
  const watchAll = watch();
  useEffect(() => {
    if (!caseId) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      // Skip save if required fields are empty
      if (!watchAll.title?.trim() || !watchAll.applicationDate) return;

      const now = new Date().toISOString();
      const caseData = {
        id: caseId,
        applicationNumber: watchAll.applicationNumber || null,
        title: watchAll.title,
        applicationDate: watchAll.applicationDate,
        patentType: "invention" as const,
        textVersion: watchAll.textVersion as PatentCase["textVersion"],
        targetClaimNumber: watchAll.targetClaimNumber,
        guidelineVersion: "2023",
        workflowState: (currentCase?.workflowState ?? "empty") as PatentCase["workflowState"],
        createdAt: currentCase?.createdAt ?? now,
        updatedAt: now,
        ...(watchAll.applicant ? { applicant: watchAll.applicant } : {}),
        ...(watchAll.priorityDate ? { priorityDate: watchAll.priorityDate } : {}),
        ...(watchAll.examinerNotes ? { examinerNotes: watchAll.examinerNotes } : {})
      } satisfies PatentCase;

      if (currentCase) {
        await updateCase(caseData);
      } else {
        await createCase(caseData);
      }
      setCurrentCase(caseData);
    }, 400);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watchAll), caseId]);

  const validateTitle = (value: string) => {
    if (!value || value.trim().length === 0) return "发明名称为必填项";
    if (value.length > 120) return "发明名称不超过 120 字";
    return true;
  };

  const validateAppNumber = (value: string) => {
    if (!value || value.trim().length === 0) return true;
    return /^(CN)?\d{9,13}[A-Z]?$/.test(value.trim()) || "申请号格式不正确";
  };

  const validateAppDate = (value: string) => {
    if (!value) return "申请日为必填项";
    if (value > new Date().toISOString().slice(0, 10)) return "申请日不能晚于今日";
    return true;
  };

  const validatePriorityDate = (value: string) => {
    if (!value) return true;
    const appDate = watch("applicationDate");
    if (appDate && value > appDate) return "优先权日不能晚于申请日";
    return true;
  };

  return (
    <div className="case-baseline-form" data-testid="page-baseline">
      <h2>案件基线</h2>
      <form onSubmit={handleSubmit(() => {})} noValidate>
        <div className="form-field">
          <label htmlFor="title">发明名称 *</label>
          <input
            id="title"
            data-testid="input-title"
            {...register("title", { validate: validateTitle })}
            maxLength={120}
          />
          {errors.title && <span className="form-error">{errors.title.message}</span>}
        </div>

        <div className="form-field">
          <label htmlFor="applicationNumber">申请号</label>
          <input
            id="applicationNumber"
            data-testid="input-application-number"
            {...register("applicationNumber", { validate: validateAppNumber })}
          />
          {errors.applicationNumber && (
            <span className="form-error">{errors.applicationNumber.message}</span>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="applicant">申请人</label>
          <input
            id="applicant"
            data-testid="input-applicant"
            {...register("applicant")}
            maxLength={120}
          />
          {errors.applicant && <span className="form-error">{errors.applicant.message}</span>}
        </div>

        <div className="form-field">
          <label htmlFor="applicationDate">申请日 *</label>
          <input
            id="applicationDate"
            data-testid="input-application-date"
            type="date"
            {...register("applicationDate", { validate: validateAppDate })}
          />
          {errors.applicationDate && (
            <span className="form-error">{errors.applicationDate.message}</span>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="priorityDate">优先权日</label>
          <input
            id="priorityDate"
            data-testid="input-priority-date"
            type="date"
            {...register("priorityDate", { validate: validatePriorityDate })}
          />
          {errors.priorityDate && (
            <span className="form-error">{errors.priorityDate.message}</span>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="targetClaimNumber">目标权利要求 *</label>
          <input
            id="targetClaimNumber"
            data-testid="input-target-claim"
            type="number"
            min={1}
            {...register("targetClaimNumber", { valueAsNumber: true })}
          />
          {errors.targetClaimNumber && (
            <span className="form-error">{errors.targetClaimNumber.message}</span>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="textVersion">审查文本版本 *</label>
          <select
            id="textVersion"
            data-testid="input-text-version"
            {...register("textVersion")}
          >
            <option value="original">原始文本</option>
            <option value="amended-1">修改文本 1</option>
            <option value="amended-2">修改文本 2</option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="examinerNotes">审查备注</label>
          <textarea
            id="examinerNotes"
            data-testid="input-examiner-notes"
            {...register("examinerNotes")}
            maxLength={2000}
            rows={4}
          />
          {errors.examinerNotes && (
            <span className="form-error">{errors.examinerNotes.message}</span>
          )}
        </div>
      </form>
    </div>
  );
}
