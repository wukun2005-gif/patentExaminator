/**
 * 同步配置面板 — 跨设备数据同步设置
 */
import { useState, useEffect, useCallback } from "react";
import { useSettingsStore } from "../../store";
import { checkSyncStatus, uploadToServer, downloadFromServer, syncWithServer } from "../../lib/syncClient";

export function SyncConfigPanel() {
  const { syncStatus, setSyncStatus } = useSettingsStore();
  const [lastResult, setLastResult] = useState<string>("");

  const refreshStatus = useCallback(async () => {
    const status = await checkSyncStatus();
    setSyncStatus(status);
  }, [setSyncStatus]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleSync = async () => {
    setSyncStatus({ syncing: true, error: null });
    setLastResult("同步中...");
    try {
      const result = await syncWithServer();
      if (result.ok) {
        setLastResult(`同步完成：上传 ${result.uploaded ?? 0} 条，下载 ${result.downloaded ?? 0} 条`);
        await refreshStatus();
      } else {
        setLastResult(`同步失败：${result.error}`);
        setSyncStatus({ error: result.error ?? "Unknown error" });
      }
    } catch (err) {
      setLastResult(`同步失败：${err}`);
      setSyncStatus({ error: String(err) });
    } finally {
      setSyncStatus({ syncing: false });
    }
  };

  const handleUpload = async () => {
    setSyncStatus({ syncing: true, error: null });
    setLastResult("上传中...");
    try {
      const result = await uploadToServer();
      if (result.ok) {
        setLastResult(`上传完成：${result.uploaded ?? 0} 条记录`);
        await refreshStatus();
      } else {
        setLastResult(`上传失败：${result.error}`);
      }
    } catch (err) {
      setLastResult(`上传失败：${err}`);
    } finally {
      setSyncStatus({ syncing: false });
    }
  };

  const handleDownload = async () => {
    setSyncStatus({ syncing: true, error: null });
    setLastResult("下载中...");
    try {
      const result = await downloadFromServer();
      if (result.ok) {
        setLastResult(`下载完成：${result.downloaded ?? 0} 条记录`);
        await refreshStatus();
      } else {
        setLastResult(`下载失败：${result.error}`);
      }
    } catch (err) {
      setLastResult(`下载失败：${err}`);
    } finally {
      setSyncStatus({ syncing: false });
    }
  };

  return (
    <div className="sync-config-panel" data-testid="sync-config-panel">
      {/* 连接状态 */}
      <div className="knowledge-config-section">
        <h4>服务器连接</h4>
        <div className="knowledge-stats">
          <span>状态: {syncStatus.connected ? "✅ 已连接" : "❌ 未连接"}</span>
          <span>最后同步: {syncStatus.lastSync ? new Date(syncStatus.lastSync).toLocaleString() : "从未"}</span>
        </div>
        {!syncStatus.connected && (
          <p className="knowledge-hint" style={{ color: "var(--danger)" }}>
            无法连接到服务器同步服务。请确保服务器已启动。
          </p>
        )}
      </div>

      {/* 同步操作 */}
      <div className="knowledge-config-section">
        <h4>数据同步</h4>
        <p className="knowledge-hint">
          同步会将本地数据上传到服务器，并从服务器下载最新数据。
          首次同步会自动上传本地已有的所有案件和知识库数据。
        </p>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
          <button
            type="button"
            onClick={handleSync}
            disabled={!syncStatus.connected || syncStatus.syncing}
            data-testid="btn-sync"
          >
            {syncStatus.syncing ? "同步中..." : "双向同步"}
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!syncStatus.connected || syncStatus.syncing}
            data-testid="btn-upload"
          >
            仅上传
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!syncStatus.connected || syncStatus.syncing}
            data-testid="btn-download"
          >
            仅下载
          </button>
          <button
            type="button"
            onClick={refreshStatus}
            disabled={syncStatus.syncing}
          >
            刷新状态
          </button>
        </div>
      </div>

      {/* 操作结果 */}
      {lastResult && (
        <div className="knowledge-config-section">
          <div className="knowledge-hint" style={{ padding: "0.5rem", background: "var(--bg-secondary)", borderRadius: "4px" }}>
            {lastResult}
          </div>
        </div>
      )}

      {/* 说明 */}
      <div className="knowledge-config-section">
        <h4>说明</h4>
        <ul className="knowledge-hint" style={{ paddingLeft: "1.5rem" }}>
          <li>数据存储在服务器的 SQLite 文件中（data/patent-examiner.db）</li>
          <li>本地浏览器数据作为缓存，离线时可正常使用</li>
          <li>无密码认证，服务器只存一份数据</li>
          <li>文件（PDF 等）会同步到服务器的 data/files/ 目录</li>
        </ul>
      </div>
    </div>
  );
}
