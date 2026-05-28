import { describe, it, expect } from "vitest";
import { validateExternalUrl, validateProviderBaseUrls, BlockedUrlError } from "@server/lib/urlValidation";

describe("validateExternalUrl", () => {
  it("allows valid https URLs", () => {
    expect(() => validateExternalUrl("https://api.tavily.com/search")).not.toThrow();
    expect(() => validateExternalUrl("https://open.bigmodel.cn/api/v4")).not.toThrow();
  });

  it("allows valid http URLs", () => {
    expect(() => validateExternalUrl("http://example.com/api")).not.toThrow();
  });

  it("blocks localhost", () => {
    expect(() => validateExternalUrl("http://localhost:3000/api")).toThrow(BlockedUrlError);
    expect(() => validateExternalUrl("http://localhost/api")).toThrow(BlockedUrlError);
  });

  it("blocks 127.x.x.x", () => {
    expect(() => validateExternalUrl("http://127.0.0.1:6379/")).toThrow(BlockedUrlError);
    expect(() => validateExternalUrl("http://127.0.0.2/")).toThrow(BlockedUrlError);
  });

  it("blocks 10.x.x.x (RFC 1918)", () => {
    expect(() => validateExternalUrl("http://10.0.0.1/")).toThrow(BlockedUrlError);
    expect(() => validateExternalUrl("http://10.255.255.255/")).toThrow(BlockedUrlError);
  });

  it("blocks 192.168.x.x (RFC 1918)", () => {
    expect(() => validateExternalUrl("http://192.168.1.1/")).toThrow(BlockedUrlError);
  });

  it("blocks 172.16-31.x.x (RFC 1918)", () => {
    expect(() => validateExternalUrl("http://172.16.0.1/")).toThrow(BlockedUrlError);
    expect(() => validateExternalUrl("http://172.31.255.255/")).toThrow(BlockedUrlError);
  });

  it("blocks 169.254.x.x (link-local)", () => {
    expect(() => validateExternalUrl("http://169.254.169.254/latest/meta-data/")).toThrow(BlockedUrlError);
  });

  it("blocks 0.x.x.x", () => {
    expect(() => validateExternalUrl("http://0.0.0.0/")).toThrow(BlockedUrlError);
  });

  it("blocks IPv6 loopback", () => {
    expect(() => validateExternalUrl("http://[::1]/")).toThrow(BlockedUrlError);
  });

  it("blocks non-http protocols", () => {
    expect(() => validateExternalUrl("ftp://example.com/")).toThrow(BlockedUrlError);
    expect(() => validateExternalUrl("file:///etc/passwd")).toThrow(BlockedUrlError);
  });

  it("blocks invalid URL format", () => {
    expect(() => validateExternalUrl("not-a-url")).toThrow(BlockedUrlError);
  });

  it("blocks AWS metadata endpoint", () => {
    expect(() => validateExternalUrl("http://169.254.169.254/latest/meta-data/")).toThrow(BlockedUrlError);
  });
});

describe("validateProviderBaseUrls", () => {
  it("passes undefined (no-op)", () => {
    expect(() => validateProviderBaseUrls(undefined)).not.toThrow();
  });

  it("passes empty record", () => {
    expect(() => validateProviderBaseUrls({})).not.toThrow();
  });

  it("passes valid URLs", () => {
    expect(() => validateProviderBaseUrls({
      gemini: "https://generativelanguage.googleapis.com/v1beta",
      mimo: "https://token-plan-cn.xiaomimimo.com/v1"
    })).not.toThrow();
  });

  it("blocks first invalid URL in record", () => {
    expect(() => validateProviderBaseUrls({
      gemini: "https://generativelanguage.googleapis.com/v1beta",
      evil: "http://169.254.169.254/latest/"
    })).toThrow(BlockedUrlError);
  });
});
