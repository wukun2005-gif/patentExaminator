import { describe, it, expect } from "vitest";
import { validateCaseBaseline } from "@client/features/case/caseValidation";

describe("validateCaseBaseline", () => {
  const validValues = {
    title: "测试发明",
    applicationDate: "2023-03-15",
    targetClaimNumber: 1
  };

  it("valid values → no errors", () => {
    const errors = validateCaseBaseline(validValues);
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it("empty title → error", () => {
    const errors = validateCaseBaseline({ ...validValues, title: "" });
    expect(errors.title).toBe("发明名称为必填项");
  });

  it("title over 120 chars → error", () => {
    const errors = validateCaseBaseline({ ...validValues, title: "a".repeat(121) });
    expect(errors.title).toBe("发明名称不超过 120 字");
  });

  it("invalid applicationNumber → error", () => {
    const errors = validateCaseBaseline({ ...validValues, applicationNumber: "abc" });
    expect(errors.applicationNumber).toBe("申请号格式不正确");
  });

  it("valid applicationNumber (CN format) → no error", () => {
    const errors = validateCaseBaseline({
      ...validValues,
      applicationNumber: "CN2023100000001"
    });
    expect(errors.applicationNumber).toBeUndefined();
  });

  it("missing applicationDate → error", () => {
    const errors = validateCaseBaseline({ ...validValues, applicationDate: "" });
    expect(errors.applicationDate).toBe("申请日为必填项");
  });

  it("future applicationDate → error", () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    const dateStr = futureDate.toISOString().slice(0, 10);
    const errors = validateCaseBaseline({ ...validValues, applicationDate: dateStr });
    expect(errors.applicationDate).toBe("申请日不能晚于今日");
  });

  it("priorityDate after applicationDate → error", () => {
    const errors = validateCaseBaseline({
      ...validValues,
      applicationDate: "2023-07-20",
      priorityDate: "2023-08-01"
    });
    expect(errors.priorityDate).toBe("优先权日不能晚于申请日");
  });

  it("priorityDate before applicationDate → no error", () => {
    const errors = validateCaseBaseline({
      ...validValues,
      applicationDate: "2023-07-20",
      priorityDate: "2021-07-20"
    });
    expect(errors.priorityDate).toBeUndefined();
  });

  it("priorityDate equal to applicationDate → no error", () => {
    const errors = validateCaseBaseline({
      ...validValues,
      applicationDate: "2023-07-20",
      priorityDate: "2023-07-20"
    });
    expect(errors.priorityDate).toBeUndefined();
  });

  it("missing targetClaimNumber → error", () => {
    const errors = validateCaseBaseline({
      ...validValues,
      targetClaimNumber: undefined as unknown as number
    });
    expect(errors.targetClaimNumber).toBe("目标权利要求为必填项");
  });

  it("targetClaimNumber = 0 → error", () => {
    const errors = validateCaseBaseline({ ...validValues, targetClaimNumber: 0 });
    expect(errors.targetClaimNumber).toBe("请输入正整数");
  });

  it("examinerNotes over 2000 chars → error", () => {
    const errors = validateCaseBaseline({ ...validValues, examinerNotes: "a".repeat(2001) });
    expect(errors.examinerNotes).toBe("审查备注不超过 2000 字");
  });

  it("applicant over 120 chars → error", () => {
    const errors = validateCaseBaseline({ ...validValues, applicant: "a".repeat(121) });
    expect(errors.applicant).toBe("申请人不超过 120 字");
  });
});
