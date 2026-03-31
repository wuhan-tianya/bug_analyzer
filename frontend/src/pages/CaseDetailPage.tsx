import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSteps, getImageUrl } from "../api/client";
import type { StepsResponse, StepGroup, PerceptionItem } from "../types/case";
import ImageOverlay from "../components/ImageOverlay";
import JsonViewer from "../components/JsonViewer";
import "./CaseDetailPage.css";

export default function CaseDetailPage() {
    const { taskId, caseId } = useParams<{
        taskId: string;
        caseId: string;
    }>();
    const navigate = useNavigate();

    const [data, setData] = useState<StepsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!taskId || !caseId) return;

        setLoading(true);
        setError("");

        getSteps(taskId, caseId)
            .then((res) => {
                setData(res);
                // Expand first step by default
                if (res.steps.length > 0) {
                    setExpandedSteps(new Set([res.steps[0].step_base]));
                }
            })
            .catch((err) => {
                setError(err.message || "Failed to load steps");
            })
            .finally(() => {
                setLoading(false);
            });
    }, [taskId, caseId]);

    const toggleStep = (stepBase: string) => {
        setExpandedSteps((prev) => {
            const next = new Set(prev);
            if (next.has(stepBase)) {
                next.delete(stepBase);
            } else {
                next.add(stepBase);
            }
            return next;
        });
    };

    const expandAll = () => {
        if (data) {
            setExpandedSteps(new Set(data.steps.map((s) => s.step_base)));
        }
    };

    const collapseAll = () => {
        setExpandedSteps(new Set());
    };

    return (
        <div className="detail-page">
            {/* Background */}
            <div className="bg-grid" />
            <div className="bg-glow bg-glow-1" />

            <div className="container">
                {/* Navigation */}
                <nav className="detail-nav animate-fade-in">
                    <button
                        id="back-btn"
                        className="btn btn-ghost"
                        onClick={() => navigate("/")}
                    >
                        ← 返回搜索
                    </button>
                    <div className="nav-breadcrumb">
                        <span className="breadcrumb-item" onClick={() => navigate("/")}>
                            首页
                        </span>
                        <span className="breadcrumb-sep">/</span>
                        <span className="breadcrumb-item accent-text">{taskId}</span>
                        <span className="breadcrumb-sep">/</span>
                        <span className="breadcrumb-item accent-text">{caseId}</span>
                    </div>
                </nav>

                {/* Header */}
                <header className="detail-header animate-slide-up">
                    <div>
                        <h1>用例详情</h1>
                        <div className="detail-meta">
                            <span className="badge badge-accent">Task: {taskId}</span>
                            <span className="badge badge-info">Case: {caseId}</span>
                            {data && (
                                <span className="badge badge-success">
                                    {data.steps.length} 个步骤
                                </span>
                            )}
                        </div>
                    </div>
                    {data && data.steps.length > 0 && (
                        <div className="header-actions">
                            <button className="btn btn-secondary" onClick={expandAll}>
                                展开全部
                            </button>
                            <button className="btn btn-secondary" onClick={collapseAll}>
                                收起全部
                            </button>
                        </div>
                    )}
                </header>

                {/* Loading */}
                {loading && (
                    <div className="loading-container glass-card">
                        <div className="spinner" />
                        <div className="loading-text">正在加载步骤数据...</div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="status-message status-error glass-card">
                        <span>❌</span> {error}
                    </div>
                )}

                {/* Steps */}
                {!loading && !error && data && (
                    <div className="steps-container">
                        {data.steps.length === 0 ? (
                            <div className="empty-state glass-card">
                                <div className="empty-state-icon">📭</div>
                                <div className="empty-state-text">暂无步骤数据</div>
                            </div>
                        ) : (
                            data.steps.map((step, idx) => (
                                <StepCard
                                    key={step.step_base}
                                    step={step}
                                    index={idx}
                                    expanded={expandedSteps.has(step.step_base)}
                                    onToggle={() => toggleStep(step.step_base)}
                                />
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Step Card Component ──────────────────────────────────────

function StepCard({
    step,
    index,
    expanded,
    onToggle,
}: {
    step: StepGroup;
    index: number;
    expanded: boolean;
    onToggle: () => void;
}) {
    const [selectedPerception, setSelectedPerception] =
        useState<PerceptionItem | null>(null);

    return (
        <div
            className={`step-card glass-card animate-fade-in ${expanded ? "expanded" : ""}`}
            style={{ animationDelay: `${index * 0.08}s` }}
        >
            <button
                className="step-card-header"
                onClick={onToggle}
                id={`step-toggle-${step.step_base}`}
            >
                <div className="step-title">
                    <span className="step-number">
                        #{step.step_num !== null ? step.step_num : index + 1}
                    </span>
                    <span className="step-name">步骤 {step.step_base}</span>
                </div>
                <div className="step-tags">
                    {step.operation && (
                        <span className="badge badge-info">Operation</span>
                    )}
                    {step.assert_step && (
                        <span className="badge badge-warning">Assert</span>
                    )}
                </div>
                <span className={`expand-icon ${expanded ? "rotated" : ""}`}>▼</span>
            </button>

            {expanded && (
                <div className="step-card-body">
                    {/* Operation Section */}
                    {step.operation && (
                        <div className="category-section">
                            <h3 className="category-title">
                                <span className="category-badge operation-badge">
                                    ⚙️ Operation
                                </span>
                            </h3>

                            <div className="images-row">
                                {/* YOLO Image with overlay */}
                                <div className="image-block">
                                    <div className="image-label">YOLO 感知图片（底图 + 感知框）</div>
                                    {step.operation.yolo_image_url ? (
                                        <ImageOverlay
                                            imageUrl={getImageUrl(step.operation.yolo_image_url)!}
                                            perceptions={step.operation.normalized_detections || []}
                                            imageSize={step.operation.image_size}
                                            onPerceptionClick={(p: PerceptionItem) => setSelectedPerception(p)}
                                            onClear={() => setSelectedPerception(null)}
                                        />
                                    ) : (
                                        <div className="image-empty">
                                            <span>🖼️</span>
                                            <span>暂无图片</span>
                                        </div>
                                    )}
                                </div>

                                {/* Annotated Image */}
                                <div className="image-block">
                                    <div className="image-label">标注图片（参考）</div>
                                    {step.operation.annotated_image_url ? (
                                        <div className="image-wrapper">
                                            <img
                                                src={getImageUrl(step.operation.annotated_image_url)!}
                                                alt="Annotated"
                                                className="step-image"
                                                loading="lazy"
                                            />
                                        </div>
                                    ) : (
                                        <div className="image-empty">
                                            <span>🖼️</span>
                                            <span>暂无图片</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* JSON Data */}
                            <div className="json-section">
                                <div className="json-header">
                                    <span>📋 感知 JSON 数据</span>
                                    {selectedPerception && (
                                        <span className="badge badge-accent">
                                            已选中: {selectedPerception.content || `ID ${selectedPerception.id}`}
                                        </span>
                                    )}
                                </div>
                                {selectedPerception ? (
                                    <JsonViewer data={selectedPerception} />
                                ) : step.operation.raw_json ? (
                                    <JsonViewer data={step.operation.raw_json} />
                                ) : (
                                    <div className="json-empty">暂无 JSON 数据</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Assert Section */}
                    {step.assert_step && (
                        <div className="category-section">
                            <h3 className="category-title">
                                <span className="category-badge assert-badge">
                                    ✅ Assert
                                </span>
                            </h3>

                            <div className="images-row">
                                {/* Before Action */}
                                <div className="image-block">
                                    <div className="image-label">操作前（Before Action）</div>
                                    {step.assert_step.before_action_image_url ? (
                                        <ImageOverlay
                                            imageUrl={
                                                getImageUrl(step.assert_step.before_action_image_url)!
                                            }
                                            perceptions={
                                                step.assert_step.perception_infos_pre || []
                                            }
                                            imageSize={step.assert_step.image_size}
                                            onPerceptionClick={(p: PerceptionItem) => setSelectedPerception(p)}
                                            onClear={() => setSelectedPerception(null)}
                                        />
                                    ) : (
                                        <div className="image-empty">
                                            <span>🖼️</span>
                                            <span>暂无图片</span>
                                        </div>
                                    )}
                                </div>

                                {/* After Action */}
                                <div className="image-block">
                                    <div className="image-label">操作后（After Action）</div>
                                    {step.assert_step.after_action_image_url ? (
                                        <ImageOverlay
                                            imageUrl={
                                                getImageUrl(step.assert_step.after_action_image_url)!
                                            }
                                            perceptions={
                                                step.assert_step.perception_infos_post || []
                                            }
                                            imageSize={step.assert_step.image_size}
                                            onPerceptionClick={(p: PerceptionItem) => setSelectedPerception(p)}
                                            onClear={() => setSelectedPerception(null)}
                                        />
                                    ) : (
                                        <div className="image-empty">
                                            <span>🖼️</span>
                                            <span>暂无图片</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* JSON Data */}
                            <div className="json-section">
                                <div className="json-header">
                                    <span>📋 感知 JSON 数据</span>
                                    {selectedPerception && (
                                        <span className="badge badge-accent">
                                            已选中: {selectedPerception.content || `ID ${selectedPerception.id}`}
                                        </span>
                                    )}
                                </div>
                                {selectedPerception ? (
                                    <JsonViewer data={selectedPerception} />
                                ) : step.assert_step.raw_json ? (
                                    <JsonViewer data={step.assert_step.raw_json} />
                                ) : (
                                    <div className="json-empty">暂无 JSON 数据</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* No content for this step */}
                    {!step.operation && !step.assert_step && (
                        <div className="empty-state">
                            <div className="empty-state-icon">📭</div>
                            <div className="empty-state-text">该步骤无数据</div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
