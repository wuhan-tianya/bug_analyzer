import { useState } from "react";
import "./JsonViewer.css";

interface JsonViewerProps {
    data: any;
    maxDepth?: number;
}

/**
 * A syntax-highlighted, collapsible JSON viewer component.
 */
export default function JsonViewer({ data, maxDepth = 8 }: JsonViewerProps) {
    const [collapsed, setCollapsed] = useState(false);

    if (data === null || data === undefined) {
        return <div className="json-viewer"><span className="jv-null">null</span></div>;
    }

    return (
        <div className="json-viewer-container">
            <div className="json-viewer-toolbar">
                <button
                    className="btn btn-ghost json-toggle-btn"
                    onClick={() => setCollapsed(!collapsed)}
                >
                    {collapsed ? "展开" : "收起"}
                </button>
                <button
                    className="btn btn-ghost json-copy-btn"
                    onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
                    }}
                >
                    📋 复制
                </button>
            </div>
            <div className={`json-viewer ${collapsed ? "json-collapsed" : ""}`}>
                {collapsed ? (
                    <span className="jv-collapsed-hint">
                        {Array.isArray(data)
                            ? `Array(${data.length})`
                            : typeof data === "object"
                                ? `Object {${Object.keys(data).length} keys}`
                                : String(data)}
                    </span>
                ) : (
                    <JsonNode value={data} depth={0} maxDepth={maxDepth} />
                )}
            </div>
        </div>
    );
}

function JsonNode({
    value,
    depth,
    maxDepth,
}: {
    value: any;
    depth: number;
    maxDepth: number;
}) {
    const [isExpanded, setIsExpanded] = useState(depth < 3);
    const indent = "  ".repeat(depth);
    const childIndent = "  ".repeat(depth + 1);

    if (value === null) {
        return <span className="jv-null">null</span>;
    }

    if (value === undefined) {
        return <span className="jv-null">undefined</span>;
    }

    if (typeof value === "boolean") {
        return <span className="jv-boolean">{String(value)}</span>;
    }

    if (typeof value === "number") {
        return <span className="jv-number">{value}</span>;
    }

    if (typeof value === "string") {
        // Truncate very long strings
        const display = value.length > 200 ? value.substring(0, 200) + "..." : value;
        return <span className="jv-string">"{display}"</span>;
    }

    if (depth >= maxDepth) {
        return (
            <span className="jv-collapsed-hint">
                {Array.isArray(value)
                    ? `Array(${value.length})`
                    : `Object {${Object.keys(value).length}}`}
            </span>
        );
    }

    if (Array.isArray(value)) {
        if (value.length === 0) {
            return <span className="jv-bracket">[]</span>;
        }

        return (
            <span>
                <span
                    className="jv-bracket jv-toggle"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    [{!isExpanded && <span className="jv-ellipsis">...{value.length} items</span>}
                </span>
                {isExpanded && (
                    <>
                        {"\n"}
                        {value.map((item, idx) => (
                            <span key={idx}>
                                {childIndent}
                                <JsonNode value={item} depth={depth + 1} maxDepth={maxDepth} />
                                {idx < value.length - 1 ? "," : ""}
                                {"\n"}
                            </span>
                        ))}
                        {indent}
                    </>
                )}
                <span className="jv-bracket">]</span>
            </span>
        );
    }

    if (typeof value === "object") {
        const keys = Object.keys(value);
        if (keys.length === 0) {
            return <span className="jv-bracket">{"{}"}</span>;
        }

        return (
            <span>
                <span
                    className="jv-bracket jv-toggle"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {"{"}{!isExpanded && <span className="jv-ellipsis">...{keys.length} keys</span>}
                </span>
                {isExpanded && (
                    <>
                        {"\n"}
                        {keys.map((key, idx) => (
                            <span key={key}>
                                {childIndent}
                                <span className="jv-key">"{key}"</span>
                                <span className="jv-colon">: </span>
                                <JsonNode
                                    value={value[key]}
                                    depth={depth + 1}
                                    maxDepth={maxDepth}
                                />
                                {idx < keys.length - 1 ? "," : ""}
                                {"\n"}
                            </span>
                        ))}
                        {indent}
                    </>
                )}
                <span className="jv-bracket">{"}"}</span>
            </span>
        );
    }

    return <span>{String(value)}</span>;
}
