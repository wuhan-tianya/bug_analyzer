/**
 * API client for communicating with the FastAPI backend.
 */
import type {
    ImportResult,
    CaseListResponse,
    StepsResponse,
} from "../types/case";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
            const err = await response.json();
            detail = err.detail || detail;
        } catch {
            // ignore
        }
        throw new Error(detail);
    }
    return response.json();
}

/**
 * Import data by providing a server-side directory path.
 */
export async function importFromDirectory(
    rootDir: string
): Promise<ImportResult> {
    const form = new FormData();
    form.append("root_dir", rootDir);

    const res = await fetch(`${API_BASE}/api/init/import`, {
        method: "POST",
        body: form,
    });
    return handleResponse<ImportResult>(res);
}

/**
 * Import data by uploading files from the browser.
 */
export async function importFromFiles(
    files: FileList
): Promise<ImportResult> {
    const form = new FormData();
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Use webkitRelativePath to preserve directory structure
        const relativePath =
            (file as any).webkitRelativePath || file.name;
        form.append("files", file, relativePath);
    }

    const res = await fetch(`${API_BASE}/api/init/import`, {
        method: "POST",
        body: form,
    });
    return handleResponse<ImportResult>(res);
}

/**
 * Get list of cases for a task.
 */
export async function getCases(taskId: string): Promise<CaseListResponse> {
    const res = await fetch(`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}/cases`);
    return handleResponse<CaseListResponse>(res);
}

/**
 * Get step details for a case.
 */
export async function getSteps(
    taskId: string,
    caseId: string
): Promise<StepsResponse> {
    const res = await fetch(
        `${API_BASE}/api/case/${encodeURIComponent(taskId)}/${encodeURIComponent(caseId)}/steps`
    );
    return handleResponse<StepsResponse>(res);
}

/**
 * Build a full image URL from a relative API path.
 */
export function getImageUrl(path: string | null): string | null {
    if (!path) return null;
    return `${API_BASE}${path}`;
}
