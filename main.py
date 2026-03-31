"""
FastAPI backend for the Test Case Viewer application.
Provides APIs for importing test data, querying tasks/cases, and serving images.
"""
import os
import json
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from database import (
    init_db, get_connection, load_memory_cache,
    get_cases_by_task, get_steps_by_case, get_step_by_id,
    task_exists, case_exists
)
from services import process_import_from_directory, process_uploaded_files, DATA_ROOT
from models import (
    ImportResult, CaseListResponse, CaseItem,
    StepsResponse, StepGroup, OperationStepDetail, AssertStepDetail
)

# In-memory cache
memory_cache = {"tasks": {}, "cases": {}}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize DB and load cache on startup."""
    init_db()
    conn = get_connection()
    global memory_cache
    memory_cache = load_memory_cache(conn)
    conn.close()
    print(f"Loaded {len(memory_cache['tasks'])} tasks, "
          f"{sum(len(v) for v in memory_cache['cases'].values())} cases into cache.")
    yield
    memory_cache.clear()


app = FastAPI(
    title="Test Case Viewer API",
    description="API for viewing test cases with YOLO perception results",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Import API ────────────────────────────────────────────────

@app.post("/api/init/import", response_model=ImportResult)
async def import_data(
    files: list[UploadFile] = File(default=[]),
    root_dir: Optional[str] = Form(default=None)
):
    """
    Import test data.
    Option 1: Upload files from frontend (multipart form with relative paths).
    Option 2: Provide a server-side directory path.
    """
    global memory_cache

    if root_dir:
        # Server-side directory import
        result = process_import_from_directory(root_dir)
    elif files:
        # Frontend file upload
        files_data = []
        for f in files:
            content = await f.read()
            # webkitRelativePath is sent as filename by the frontend
            rel_path = f.filename or ""
            files_data.append({
                "relative_path": rel_path,
                "content": content
            })
        result = process_uploaded_files(files_data)
    else:
        raise HTTPException(status_code=400, detail="Either 'files' or 'root_dir' must be provided.")

    # Refresh memory cache
    conn = get_connection()
    memory_cache = load_memory_cache(conn)
    conn.close()

    return ImportResult(**result)


# ─── Task & Case APIs ──────────────────────────────────────────

@app.get("/api/tasks/{task_id}/cases", response_model=CaseListResponse)
async def get_task_cases(task_id: str):
    """Get list of cases for a given task."""
    # Check cache first
    if task_id not in memory_cache.get("tasks", {}):
        # Fallback to DB
        conn = get_connection()
        if not task_exists(conn, task_id):
            conn.close()
            raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
        conn.close()

    conn = get_connection()
    cases = get_cases_by_task(conn, task_id)
    conn.close()

    if not cases:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")

    # Natural sort case_ids
    def sort_key(c):
        import re
        match = re.search(r'\d+', c["case_id"])
        if match:
            return (0, int(match.group()))
        return (1, c["case_id"])

    cases.sort(key=sort_key)

    return CaseListResponse(
        task_id=task_id,
        cases=[CaseItem(case_id=c["case_id"]) for c in cases]
    )


@app.get("/api/case/{task_id}/{case_id}/steps", response_model=StepsResponse)
async def get_case_steps(task_id: str, case_id: str):
    """Get detailed steps for a specific case, grouped by step_base."""
    conn = get_connection()

    if not case_exists(conn, task_id, case_id):
        conn.close()
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found in task '{task_id}'")

    steps = get_steps_by_case(conn, task_id, case_id)
    conn.close()

    # Group by step_base
    step_groups: dict[str, dict] = {}

    for step in steps:
        sb = step["step_base"]
        if sb not in step_groups:
            step_groups[sb] = {
                "step_base": sb,
                "step_num": step["step_num"],
                "operation": None,
                "assert_step": None
            }

        category = step["category"]

        if category == "operation":
            raw_json = None
            if step["raw_json_content"]:
                try:
                    raw_json = json.loads(step["raw_json_content"])
                except (json.JSONDecodeError, TypeError):
                    raw_json = step["raw_json_content"]

            normalized = None
            if step["normalized_detections_json"]:
                try:
                    normalized = json.loads(step["normalized_detections_json"])
                except (json.JSONDecodeError, TypeError):
                    normalized = None

            image_size = None
            if step["image_width"] and step["image_height"]:
                image_size = {"width": step["image_width"], "height": step["image_height"]}

            step_groups[sb]["operation"] = OperationStepDetail(
                step_base=sb,
                step_num=step["step_num"],
                step_id=step["id"],
                yolo_image_url=f"/api/image/{step['id']}?type=yolo" if step["yolo_image_path"] else None,
                annotated_image_url=f"/api/image/{step['id']}?type=annotated" if step["annotated_image_path"] else None,
                raw_json=raw_json,
                normalized_detections=normalized,
                image_size=image_size
            )

        elif category == "assert":
            raw_json = None
            if step["raw_json_content"]:
                try:
                    raw_json = json.loads(step["raw_json_content"])
                except (json.JSONDecodeError, TypeError):
                    raw_json = step["raw_json_content"]

            pre = None
            if step["perception_infos_pre"]:
                try:
                    pre = json.loads(step["perception_infos_pre"])
                except (json.JSONDecodeError, TypeError):
                    pre = None

            post = None
            if step["perception_infos_post"]:
                try:
                    post = json.loads(step["perception_infos_post"])
                except (json.JSONDecodeError, TypeError):
                    post = None

            image_size = None
            if step["image_width"] and step["image_height"]:
                image_size = {"width": step["image_width"], "height": step["image_height"]}

            step_groups[sb]["assert_step"] = AssertStepDetail(
                step_base=sb,
                step_num=step["step_num"],
                step_id=step["id"],
                before_action_image_url=f"/api/image/{step['id']}?type=before" if step["before_action_image_path"] else None,
                after_action_image_url=f"/api/image/{step['id']}?type=after" if step["after_action_image_path"] else None,
                raw_json=raw_json,
                perception_infos_pre=pre,
                perception_infos_post=post,
                image_size=image_size
            )

    # Sort step_groups by natural order
    sorted_groups = sorted(step_groups.values(), key=lambda g: (
        0 if g["step_num"] is not None else 1,
        g["step_num"] if g["step_num"] is not None else 0,
        g["step_base"]
    ))

    return StepsResponse(
        task_id=task_id,
        case_id=case_id,
        steps=[StepGroup(**g) for g in sorted_groups]
    )


# ─── Image Serving ─────────────────────────────────────────────

@app.get("/api/image/{step_id}")
async def serve_image(step_id: int, type: str = Query(default="yolo")):
    """
    Serve an image by step ID.
    type: 'yolo', 'annotated', 'before', 'after'
    """
    conn = get_connection()
    step = get_step_by_id(conn, step_id)
    conn.close()

    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    # Map type to the correct path column
    type_map = {
        "yolo": "yolo_image_path",
        "annotated": "annotated_image_path",
        "before": "before_action_image_path",
        "after": "after_action_image_path"
    }

    path_key = type_map.get(type)
    if not path_key:
        raise HTTPException(status_code=400, detail=f"Invalid image type: {type}")

    image_path = step.get(path_key)
    if not image_path or not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail="Image not found")

    # Security: ensure path is within DATA_ROOT
    abs_path = os.path.abspath(image_path)
    abs_data_root = os.path.abspath(DATA_ROOT)
    if not abs_path.startswith(abs_data_root):
        raise HTTPException(status_code=403, detail="Forbidden image path")

    return FileResponse(abs_path)


# ─── Health Check ──────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "tasks_in_cache": len(memory_cache.get("tasks", {})),
        "cases_in_cache": sum(len(v) for v in memory_cache.get("cases", {}).values())
    }
