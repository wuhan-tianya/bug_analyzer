import { useRef, useState, useEffect, useCallback } from "react";
import type { PerceptionItem, ImageSize } from "../types/case";
import "./ImageOverlay.css";

interface ImageOverlayProps {
    imageUrl: string;
    perceptions: PerceptionItem[];
    imageSize: ImageSize | null;
    onPerceptionClick: (item: PerceptionItem) => void;
    onClear: () => void;
}

/**
 * ImageOverlay component renders an image with SVG overlay hotspots
 * for perception/detection boxes. Clicking a hotspot highlights it
 * and triggers the onPerceptionClick callback.
 */
export default function ImageOverlay({
    imageUrl,
    perceptions,
    imageSize,
    onPerceptionClick,
    onClear,
}: ImageOverlayProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const [loaded, setLoaded] = useState(false);
    const [imgDims, setImgDims] = useState({ width: 0, height: 0 });
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    const updateDimensions = useCallback(() => {
        if (imgRef.current && loaded) {
            const rect = imgRef.current.getBoundingClientRect();
            setImgDims({ width: rect.width, height: rect.height });
        }
    }, [loaded]);

    useEffect(() => {
        updateDimensions();
        window.addEventListener("resize", updateDimensions);
        return () => window.removeEventListener("resize", updateDimensions);
    }, [updateDimensions]);

    const handleImageLoad = () => {
        setLoaded(true);
        if (imgRef.current) {
            const rect = imgRef.current.getBoundingClientRect();
            setImgDims({ width: rect.width, height: rect.height });
        }
    };

    const handleBoxClick = (item: PerceptionItem, idx: number) => {
        setSelectedIdx(idx);
        onPerceptionClick(item);
    };

    const handleBackgroundClick = () => {
        setSelectedIdx(null);
        onClear();
    };

    /**
     * Convert perception coords to SVG rectangle coordinates.
     * coords format: [x1, y1, x2, y2] (top-left and bottom-right)
     * We need to scale from original image size to displayed size.
     */
    const getBoxRect = (coords: number[]) => {
        if (!coords || coords.length < 4) return null;

        const [x1, y1, x2, y2] = coords;
        const origW = imageSize?.width || imgRef.current?.naturalWidth || 1;
        const origH = imageSize?.height || imgRef.current?.naturalHeight || 1;

        const scaleX = imgDims.width / origW;
        const scaleY = imgDims.height / origH;

        return {
            x: x1 * scaleX,
            y: y1 * scaleY,
            width: (x2 - x1) * scaleX,
            height: (y2 - y1) * scaleY,
        };
    };

    return (
        <div className="image-overlay-container" ref={containerRef}>
            <div className="image-overlay-wrapper">
                <img
                    ref={imgRef}
                    src={imageUrl}
                    alt="YOLO Detection"
                    className="overlay-image"
                    onLoad={handleImageLoad}
                    loading="lazy"
                />

                {loaded && imgDims.width > 0 && perceptions.length > 0 && (
                    <svg
                        className="overlay-svg"
                        width={imgDims.width}
                        height={imgDims.height}
                        viewBox={`0 0 ${imgDims.width} ${imgDims.height}`}
                        onClick={handleBackgroundClick}
                    >
                        {perceptions.map((item, idx) => {
                            if (!item.coords) return null;
                            const rect = getBoxRect(item.coords);
                            if (!rect) return null;

                            const isSelected = selectedIdx === idx;
                            const isHovered = hoveredIdx === idx;

                            return (
                                <g key={item.id ?? idx}>
                                    {/* Clickable hotspot (transparent) */}
                                    <rect
                                        x={rect.x}
                                        y={rect.y}
                                        width={rect.width}
                                        height={rect.height}
                                        className={`overlay-hotspot ${isSelected ? "selected" : ""} ${isHovered ? "hovered" : ""}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleBoxClick(item, idx);
                                        }}
                                        onMouseEnter={() => setHoveredIdx(idx)}
                                        onMouseLeave={() => setHoveredIdx(null)}
                                    />

                                    {/* Label tooltip on hover/select */}
                                    {(isHovered || isSelected) && item.content && (
                                        <g>
                                            <rect
                                                x={rect.x}
                                                y={Math.max(0, rect.y - 22)}
                                                width={Math.min(item.content.length * 8 + 16, rect.width + 40)}
                                                height={20}
                                                rx={4}
                                                className="overlay-label-bg"
                                            />
                                            <text
                                                x={rect.x + 8}
                                                y={Math.max(0, rect.y - 22) + 14}
                                                className="overlay-label-text"
                                            >
                                                {item.content}
                                                {item.confidence !== undefined
                                                    ? ` (${(item.confidence * 100).toFixed(1)}%)`
                                                    : ""}
                                            </text>
                                        </g>
                                    )}
                                </g>
                            );
                        })}
                    </svg>
                )}

                {/* Perception count badge */}
                {perceptions.length > 0 && (
                    <div className="perception-count">
                        {perceptions.length} 个检测框
                    </div>
                )}
            </div>

            {/* Fallback: List view when no coords available */}
            {loaded && perceptions.length > 0 && perceptions.every((p) => !p.coords) && (
                <div className="perception-list">
                    <div className="perception-list-title">检测结果列表</div>
                    {perceptions.map((item, idx) => (
                        <button
                            key={item.id ?? idx}
                            className={`perception-list-item ${selectedIdx === idx ? "selected" : ""}`}
                            onClick={() => handleBoxClick(item, idx)}
                        >
                            <span className="perception-item-id">
                                #{item.id ?? idx}
                            </span>
                            <span className="perception-item-content">
                                {item.content || "未知"}
                            </span>
                            {item.confidence !== undefined && (
                                <span className="perception-item-confidence">
                                    {(item.confidence * 100).toFixed(1)}%
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
