import { parseDate } from "../../lib/dateParse";

export interface CaseValidationErrors {
  title?: string;
  applicationNumber?: string;
  applicationDate?: string;
  priorityDate?: string;
  targetClaimNumber?: string;
  applicant?: string;
  examinerNotes?: string;
}

export function validateCaseBaseline(values: {
  title?: string;
  applicationNumber?: string;
  applicationDate?: string;
  priorityDate?: string;
  targetClaimNumber?: number;
  applicant?: string;
  examinerNotes?: string;
}): CaseValidationErrors {
  const errors: CaseValidationErrors = {};

  // title: required, 1-120 chars
  if (!values.title || values.title.trim().length === 0) {
    errors.title = "发明名称为必填项";
  } else if (values.title.length > 120) {
    errors.title = "发明名称不超过 120 字";
  }

  // applicationNumber: optional, regex if provided
  if (values.applicationNumber && values.applicationNumber.trim().length > 0) {
    const appNumRegex = /^(CN)?\d{9,13}[A-Z]?$/;
    if (!appNumRegex.test(values.applicationNumber.trim())) {
      errors.applicationNumber = "申请号格式不正确";
    }
  }

  // applicationDate: required, valid date, not in the future
  if (!values.applicationDate || values.applicationDate.trim().length === 0) {
    errors.applicationDate = "申请日为必填项";
  } else {
    const parsed = parseDate(values.applicationDate);
    if (!parsed) {
      errors.applicationDate = "日期格式无法识别";
    } else if (parsed.iso > new Date().toISOString().slice(0, 10)) {
      errors.applicationDate = "申请日不能晚于今日";
    }
  }

  // priorityDate: optional, valid date, must be ≤ applicationDate
  if (values.priorityDate && values.priorityDate.trim().length > 0) {
    const parsed = parseDate(values.priorityDate);
    if (!parsed) {
      errors.priorityDate = "日期格式无法识别";
    } else if (values.applicationDate) {
      const appParsed = parseDate(values.applicationDate);
      if (appParsed && parsed.iso > appParsed.iso) {
        errors.priorityDate = "优先权日不能晚于申请日";
      }
    }
  }

  // targetClaimNumber: required, positive integer
  if (values.targetClaimNumber === undefined || values.targetClaimNumber === null) {
    errors.targetClaimNumber = "目标权利要求为必填项";
  } else if (!Number.isInteger(values.targetClaimNumber) || values.targetClaimNumber < 1) {
    errors.targetClaimNumber = "请输入正整数";
  }

  // applicant: optional, max 120 chars
  if (values.applicant && values.applicant.length > 120) {
    errors.applicant = "申请人不超过 120 字";
  }

  // examinerNotes: optional, max 2000 chars
  if (values.examinerNotes && values.examinerNotes.length > 2000) {
    errors.examinerNotes = "审查备注不超过 2000 字";
  }

  return errors;
}
