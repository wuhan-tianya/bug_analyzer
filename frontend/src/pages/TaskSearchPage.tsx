import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
    importFromDirectory,
    importFromFiles,
    getCases,
} from "../api/client";
import type { ImportResult, CaseItem } from "../types/case";
import "./TaskSearchPage.css";

export default function TaskSearchPage() {
    const navigate = useNavigate();

    // Import state
    const [importMode, setImportMode] = useState<"directory" | "files">(
        "directory"
    );
    const [directoryPath, setDirectoryPath] = useState("");
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Search state
    const [taskId, setTaskId] = useState("");
    const [cases, setCases] = useState<CaseItem[]>([]);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState("");
    const [searchedTaskId, setSearchedTaskId] = useState("");

    // ─── Import handlers ───────────────────────────────────────

    const handleImportDirectory = async () => {
        if (!directoryPath.trim()) return;
        setImporting(true);
        setImportResult(null);
        try {
            const result = await importFromDirectory(directoryPath.trim());
            setImportResult(result);
        } catch (err: any) {
            setImportResult({
                success: false,
                task_count: 0,
                case_count: 0,
                step_count: 0,
                errors: [err.message || "Import failed"],
            });
        } finally {
            setImporting(false);
        }
    };

    const handleImportFiles = async () => {
        const files = fileInputRef.current?.files;
        if (!files || files.length === 0) return;
        setImporting(true);
        setImportResult(null);
        try {
            const result = await importFromFiles(files);
            setImportResult(result);
        } catch (err: any) {
            setImportResult({
                success: false,
                task_count: 0,
                case_count: 0,
                step_count: 0,
                errors: [err.message || "Import failed"],
            });
        } finally {
            setImporting(false);
        }
    };

    // ─── Search handler ────────────────────────────────────────

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!taskId.trim()) return;

        setSearching(true);
        setSearchError("");
        setCases([]);
        setSearchedTaskId(taskId.trim());

        try {
            const response = await getCases(taskId.trim());
            setCases(response.cases);
        } catch (err: any) {
            setSearchError(err.message || "Search failed");
        } finally {
            setSearching(false);
        }
    };

    const handleCaseClick = (caseId: string) => {
        navigate(`/case/${encodeURIComponent(searchedTaskId)}/${encodeURIComponent(caseId)}`);
    };

    return (
        <div className="search-page">
            {/* Background decoration */}
            <div className="bg-grid" />
            <div className="bg-glow bg-glow-1" />
            <div className="bg-glow bg-glow-2" />

            <div className="container">
                {/* Header */}
                <header className="search-header animate-slide-up">
                    <div className="logo-container">
                        <div className="logo-icon">🔍</div>
                        <h1 className="logo-text">
                            Test Case <span className="accent-text">Viewer</span>
                        </h1>
                    </div>
                    <p className="subtitle">
                        导入测试用例数据，查看 YOLO 感知结果与步骤详情
                    </p>
                </header>

                {/* Import Section */}
                <section
                    className="section-card glass-card animate-fade-in"
                    style={{ animationDelay: "0.1s" }}
                >
                    <div className="section-header">
                        <h2>
                            <span className="section-icon">📂</span> 数据初始化
                        </h2>
                        <div className="mode-toggle">
                            <button
                                className={`mode-btn ${importMode === "directory" ? "active" : ""}`}
                                onClick={() => setImportMode("directory")}
                            >
                                服务端路径
                            </button>
                            <button
                                className={`mode-btn ${importMode === "files" ? "active" : ""}`}
                                onClick={() => setImportMode("files")}
                            >
                                上传文件
                            </button>
                        </div>
                    </div>

                    {importMode === "directory" ? (
                        <div className="import-form">
                            <div className="input-group">
                                <input
                                    id="directory-path-input"
                                    type="text"
                                    className="input"
                                    placeholder="输入服务器端用例根目录路径，例如：/data/test_cases"
                                    value={directoryPath}
                                    onChange={(e) => setDirectoryPath(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleImportDirectory()}
                                />
                                <button
                                    id="import-directory-btn"
                                    className="btn btn-primary"
                                    onClick={handleImportDirectory}
                                    disabled={importing || !directoryPath.trim()}
                                >
                                    {importing ? (
                                        <>
                                            <span className="btn-spinner" /> 导入中...
                                        </>
                                    ) : (
                                        "🚀 初始化导入"
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="import-form">
                            <div className="file-upload-area">
                                <input
                                    ref={fileInputRef}
                                    id="file-upload-input"
                                    type="file"
                                    /* @ts-ignore */
                                    webkitdirectory=""
                                    directory=""
                                    multiple
                                    className="file-input-hidden"
                                    onChange={() => {
                                        const count = fileInputRef.current?.files?.length || 0;
                                        if (count > 0) {
                                            // Force re-render
                                            setImportResult(null);
                                        }
                                    }}
                                />
                                <label htmlFor="file-upload-input" className="file-upload-label">
                                    <span className="upload-icon">📁</span>
                                    <span className="upload-text">
                                        {fileInputRef.current?.files?.length
                                            ? `已选择 ${fileInputRef.current.files.length} 个文件`
                                            : "点击选择用例目录"}
                                    </span>
                                    <span className="upload-hint">
                                        选择包含 task_id/case_id/assert|operation 结构的目录
                                    </span>
                                </label>
                            </div>
                            <button
                                id="import-files-btn"
                                className="btn btn-primary btn-lg"
                                onClick={handleImportFiles}
                                disabled={importing}
                                style={{ marginTop: "var(--space-md)" }}
                            >
                                {importing ? (
                                    <>
                                        <span className="btn-spinner" /> 上传导入中...
                                    </>
                                ) : (
                                    "🚀 上传并初始化"
                                )}
                            </button>
                        </div>
                    )}

                    {/* Import Result */}
                    {importResult && (
                        <div
                            className={`import-result ${importResult.success ? "status-success" : "status-error"}`}
                        >
                            <div className="result-header">
                                {importResult.success ? "✅ 导入成功" : "❌ 导入失败"}
                            </div>
                            <div className="result-stats">
                                <div className="stat-item">
                                    <span className="stat-value">{importResult.task_count}</span>
                                    <span className="stat-label">任务</span>
                                </div>
                                <div className="stat-item">
                                    <span className="stat-value">{importResult.case_count}</span>
                                    <span className="stat-label">用例</span>
                                </div>
                                <div className="stat-item">
                                    <span className="stat-value">{importResult.step_count}</span>
                                    <span className="stat-label">步骤</span>
                                </div>
                            </div>
                            {importResult.errors.length > 0 && (
                                <div className="result-errors">
                                    <div className="errors-title">⚠️ 错误信息：</div>
                                    <ul>
                                        {importResult.errors.map((err, i) => (
                                            <li key={i}>{err}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {/* Search Section */}
                <section
                    className="section-card glass-card animate-fade-in"
                    style={{ animationDelay: "0.2s" }}
                >
                    <div className="section-header">
                        <h2>
                            <span className="section-icon">🔎</span> 查询用例
                        </h2>
                    </div>

                    <form onSubmit={handleSearch} className="search-form">
                        <div className="input-group">
                            <input
                                id="task-id-input"
                                type="text"
                                className="input"
                                placeholder="输入 Task ID 进行搜索..."
                                value={taskId}
                                onChange={(e) => setTaskId(e.target.value)}
                            />
                            <button
                                id="search-btn"
                                type="submit"
                                className="btn btn-primary"
                                disabled={searching || !taskId.trim()}
                            >
                                {searching ? (
                                    <>
                                        <span className="btn-spinner" /> 搜索中...
                                    </>
                                ) : (
                                    "搜索"
                                )}
                            </button>
                        </div>
                    </form>

                    {/* Search Error */}
                    {searchError && (
                        <div className="status-message status-error">
                            <span>❌</span> {searchError}
                        </div>
                    )}

                    {/* Search Results */}
                    {searching && (
                        <div className="loading-container">
                            <div className="spinner" />
                            <div className="loading-text">正在搜索...</div>
                        </div>
                    )}

                    {!searching && cases.length > 0 && (
                        <div className="cases-grid">
                            <div className="cases-header">
                                <h3>
                                    Task: <span className="accent-text">{searchedTaskId}</span>
                                </h3>
                                <span className="badge badge-accent">{cases.length} 个用例</span>
                            </div>
                            <div className="cases-list">
                                {cases.map((c, idx) => (
                                    <button
                                        key={c.case_id}
                                        id={`case-item-${c.case_id}`}
                                        className="case-card"
                                        onClick={() => handleCaseClick(c.case_id)}
                                        style={{ animationDelay: `${idx * 0.05}s` }}
                                    >
                                        <div className="case-icon">📋</div>
                                        <div className="case-info">
                                            <div className="case-name">{c.case_id}</div>
                                            <div className="case-hint">点击查看详情 →</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {!searching && !searchError && searchedTaskId && cases.length === 0 && (
                        <div className="empty-state">
                            <div className="empty-state-icon">📭</div>
                            <div className="empty-state-text">未找到用例</div>
                            <div className="empty-state-hint">
                                请确认 Task ID 是否正确，或先进行数据初始化
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
