"""
Import service: parses uploaded files from the frontend, stores them on disk,
and writes metadata to SQLite.

Directory structure expected from uploads:
  {task_id}/{case_id}/{assert|operation}/stepN.(png|jpg|jpeg|json)

operation/ files per step_base (e.g., "xx"):
  - xx.jpg            : base image (for compositing)
  - xx_labeled.jpg    : labeled image with perception boxes (reference)
  - xx_steps.json     : perception data JSON

assert/ files per step_base (e.g., "xx"):
  - xx_before_action_labeled.jpg : before-action labeled image
  - xx_after_action_labeled.jpg  : after-action labeled image
  - xx_steps.json                : perception data JSON
"""
import os
import re
import json
import shutil
from typing import BinaryIO
from PIL import Image

from database import get_connection, insert_task, insert_case, insert_step, clear_task_data


DATA_ROOT = os.getenv("DATA_ROOT", "./data/uploads")

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}
ALLOWED_EXTENSIONS = IMAGE_EXTENSIONS | {".json"}


def natural_sort_key(s: str):
    """Extract number from string for natural sorting."""
    match = re.search(r'\d+', s)
    if match:
        return (0, int(match.group()))
    return (1, s)


def parse_step_base(filename: str, category: str) -> str | None:
    """
    Extract the step_base from a filename.
    For operation:
      - "xx.jpg" -> "xx"
      - "xx_labeled.jpg" -> "xx"
      - "xx_steps.json" -> "xx"
    For assert:
      - "xx_before_action_labeled.jpg" -> "xx"
      - "xx_after_action_labeled.jpg" -> "xx"
      - "xx_steps.json" -> "xx"
    """
    base, ext = os.path.splitext(filename)
    ext = ext.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return None

    if category == "operation":
        if base.endswith("_labeled"):
            return base[:-len("_labeled")]
        elif base.endswith("_steps"):
            return base[:-len("_steps")]
        else:
            return base
    elif category == "assert":
        if base.endswith("_before_action_labeled"):
            return base[:-len("_before_action_labeled")]
        elif base.endswith("_after_action_labeled"):
            return base[:-len("_after_action_labeled")]
        elif base.endswith("_steps"):
            return base[:-len("_steps")]
        else:
            # Unknown pattern, use full base
            return base
    return None


def classify_file(filename: str, category: str) -> str:
    """Classify a file by its role within the step."""
    base, ext = os.path.splitext(filename)
    ext = ext.lower()

    if ext == ".json":
        return "json"

    if category == "operation":
        if base.endswith("_labeled"):
            return "annotated_image"
        else:
            return "yolo_image"
    elif category == "assert":
        if base.endswith("_before_action_labeled"):
            return "before_action_image"
        elif base.endswith("_after_action_labeled"):
            return "after_action_image"
        else:
            return "yolo_image"

    return "unknown"


def get_image_dimensions(filepath: str) -> tuple[int, int] | None:
    """Get image width and height."""
    try:
        with Image.open(filepath) as img:
            return img.size  # (width, height)
    except Exception:
        return None


def extract_perception_data(json_content: dict, category: str) -> dict:
    """
    Extract perception info from JSON content.
    For operation: perception field from root, and body[1]
    For assert: body[1].percption_infos_pre and body[1].percption_infos_post
    """
    result = {
        "raw_json": json_content,
        "perception_infos_pre": None,
        "perception_infos_post": None,
        "normalized_detections": None
    }

    try:
        body = json_content.get("body", [])
        if len(body) > 1:
            body_1 = body[1]
            if category == "assert":
                result["perception_infos_pre"] = body_1.get("percption_infos_pre")
                result["perception_infos_post"] = body_1.get("percption_infos_post")
            elif category == "operation":
                perception = json_content.get("percption", body_1.get("percption"))
                if perception:
                    result["normalized_detections"] = perception
    except (AttributeError, IndexError, TypeError):
        pass

    return result


def process_import_from_directory(root_dir: str) -> dict:
    """
    Scan a local directory (server-side) and import data into SQLite.
    This is used when the backend has direct access to the directory.
    """
    if not os.path.isdir(root_dir):
        return {"success": False, "task_count": 0, "case_count": 0, "step_count": 0,
                "errors": [f"Directory not found: {root_dir}"]}

    conn = get_connection()
    errors = []
    task_count = 0
    case_count = 0
    step_count = 0

    try:
        for task_id in sorted(os.listdir(root_dir)):
            task_path = os.path.join(root_dir, task_id)
            if not os.path.isdir(task_path):
                continue

            # Clear existing data for this task
            clear_task_data(conn, task_id)
            insert_task(conn, task_id)
            task_count += 1

            for case_id in sorted(os.listdir(task_path)):
                case_path = os.path.join(task_path, case_id)
                if not os.path.isdir(case_path):
                    continue

                case_pk = insert_case(conn, task_id, case_id)
                case_count += 1

                for category in ["assert", "operation"]:
                    cat_path = os.path.join(case_path, category)
                    if not os.path.isdir(cat_path):
                        continue

                    # Group files by step_base
                    step_groups: dict[str, dict] = {}
                    files = os.listdir(cat_path)

                    for fname in files:
                        _, ext = os.path.splitext(fname)
                        if ext.lower() not in ALLOWED_EXTENSIONS:
                            continue

                        step_base = parse_step_base(fname, category)
                        if step_base is None:
                            errors.append(f"Cannot parse step_base from: {os.path.join(cat_path, fname)}")
                            continue

                        if step_base not in step_groups:
                            step_groups[step_base] = {}

                        role = classify_file(fname, category)
                        file_path = os.path.join(cat_path, fname)

                        # Copy file to DATA_ROOT
                        dest_dir = os.path.join(DATA_ROOT, task_id, case_id, category)
                        os.makedirs(dest_dir, exist_ok=True)
                        dest_path = os.path.join(dest_dir, fname)
                        if not os.path.exists(dest_path) or os.path.getmtime(file_path) > os.path.getmtime(dest_path):
                            shutil.copy2(file_path, dest_path)

                        step_groups[step_base][role] = {
                            "name": fname,
                            "path": dest_path,
                            "original_path": file_path
                        }

                    # Insert steps into DB
                    for step_base, files_map in step_groups.items():
                        step_num_match = re.search(r'\d+', step_base)
                        step_num = int(step_num_match.group()) if step_num_match else None

                        step_data = {
                            "case_pk": case_pk,
                            "task_id": task_id,
                            "case_id": case_id,
                            "category": category,
                            "step_base": step_base,
                            "step_num": step_num,
                        }

                        # Process based on category
                        if category == "operation":
                            yolo = files_map.get("yolo_image", {})
                            annotated = files_map.get("annotated_image", {})
                            step_data["yolo_image_name"] = yolo.get("name")
                            step_data["yolo_image_path"] = yolo.get("path")
                            step_data["annotated_image_name"] = annotated.get("name")
                            step_data["annotated_image_path"] = annotated.get("path")

                            # Get image dimensions from yolo image
                            if yolo.get("path"):
                                dims = get_image_dimensions(yolo["path"])
                                if dims:
                                    step_data["image_width"] = dims[0]
                                    step_data["image_height"] = dims[1]

                        elif category == "assert":
                            before = files_map.get("before_action_image", {})
                            after = files_map.get("after_action_image", {})
                            step_data["before_action_image_name"] = before.get("name")
                            step_data["before_action_image_path"] = before.get("path")
                            step_data["after_action_image_name"] = after.get("name")
                            step_data["after_action_image_path"] = after.get("path")

                            if before.get("path"):
                                dims = get_image_dimensions(before["path"])
                                if dims:
                                    step_data["image_width"] = dims[0]
                                    step_data["image_height"] = dims[1]

                        # Process JSON
                        json_file = files_map.get("json", {})
                        if json_file.get("path"):
                            step_data["json_name"] = json_file["name"]
                            step_data["json_path"] = json_file["path"]
                            try:
                                with open(json_file["original_path"], "r", encoding="utf-8") as f:
                                    json_content = json.load(f)

                                perception_data = extract_perception_data(json_content, category)
                                step_data["raw_json_content"] = json.dumps(json_content, ensure_ascii=False)

                                if perception_data.get("normalized_detections"):
                                    step_data["normalized_detections_json"] = json.dumps(
                                        perception_data["normalized_detections"], ensure_ascii=False
                                    )
                                if perception_data.get("perception_infos_pre"):
                                    step_data["perception_infos_pre"] = json.dumps(
                                        perception_data["perception_infos_pre"], ensure_ascii=False
                                    )
                                if perception_data.get("perception_infos_post"):
                                    step_data["perception_infos_post"] = json.dumps(
                                        perception_data["perception_infos_post"], ensure_ascii=False
                                    )
                            except Exception as e:
                                errors.append(f"JSON parse error: {json_file['original_path']}: {e}")
                                step_data["raw_json_content"] = json.dumps({"error": str(e)})

                        insert_step(conn, step_data)
                        step_count += 1

        conn.commit()
    except Exception as e:
        conn.rollback()
        errors.append(f"Import failed: {str(e)}")
        return {"success": False, "task_count": task_count, "case_count": case_count,
                "step_count": step_count, "errors": errors}
    finally:
        conn.close()

    return {
        "success": True,
        "task_count": task_count,
        "case_count": case_count,
        "step_count": step_count,
        "errors": errors
    }


def process_uploaded_files(files_data: list[dict]) -> dict:
    """
    Process files uploaded from frontend.
    Each item in files_data should have:
      - relative_path: str (e.g., "task1/case1/operation/step1.jpg")
      - content: bytes
    """
    conn = get_connection()
    errors = []
    task_set = set()
    case_set = set()
    step_count = 0

    # Group files by task_id/case_id/category/step_base
    grouped: dict[str, dict[str, dict[str, dict[str, dict]]]] = {}

    for file_info in files_data:
        rel_path = file_info["relative_path"]
        content = file_info["content"]

        parts = rel_path.replace("\\", "/").split("/")

        # Find the task_id/case_id/category structure
        # Expected: task_id/case_id/category/filename
        if len(parts) < 4:
            errors.append(f"Invalid path structure: {rel_path}")
            continue

        # Walk the path to find assert/operation
        category_idx = None
        for i, part in enumerate(parts):
            if part in ("assert", "operation"):
                category_idx = i
                break

        if category_idx is None or category_idx < 2:
            errors.append(f"Cannot find assert/operation in path: {rel_path}")
            continue

        task_id = parts[category_idx - 2]
        case_id = parts[category_idx - 1]
        category = parts[category_idx]
        filename = parts[-1]

        _, ext = os.path.splitext(filename)
        if ext.lower() not in ALLOWED_EXTENSIONS:
            continue

        # Save file to DATA_ROOT
        dest_dir = os.path.join(DATA_ROOT, task_id, case_id, category)
        os.makedirs(dest_dir, exist_ok=True)
        dest_path = os.path.join(dest_dir, filename)
        with open(dest_path, "wb") as f:
            f.write(content)

        step_base = parse_step_base(filename, category)
        if step_base is None:
            errors.append(f"Cannot parse step_base from: {filename}")
            continue

        role = classify_file(filename, category)

        # Group by task_id -> case_id -> category -> step_base
        grouped.setdefault(task_id, {}).setdefault(case_id, {}).setdefault(category, {}).setdefault(step_base, {})
        grouped[task_id][case_id][category][step_base][role] = {
            "name": filename, "path": dest_path
        }

    try:
        for task_id, cases in grouped.items():
            clear_task_data(conn, task_id)
            insert_task(conn, task_id)
            task_set.add(task_id)

            for case_id, categories in cases.items():
                case_pk = insert_case(conn, task_id, case_id)
                case_set.add((task_id, case_id))

                for category, step_bases in categories.items():
                    for step_base, files_map in step_bases.items():
                        step_num_match = re.search(r'\d+', step_base)
                        step_num = int(step_num_match.group()) if step_num_match else None

                        step_data = {
                            "case_pk": case_pk,
                            "task_id": task_id,
                            "case_id": case_id,
                            "category": category,
                            "step_base": step_base,
                            "step_num": step_num,
                        }

                        if category == "operation":
                            yolo = files_map.get("yolo_image", {})
                            annotated = files_map.get("annotated_image", {})
                            step_data["yolo_image_name"] = yolo.get("name")
                            step_data["yolo_image_path"] = yolo.get("path")
                            step_data["annotated_image_name"] = annotated.get("name")
                            step_data["annotated_image_path"] = annotated.get("path")
                            if yolo.get("path"):
                                dims = get_image_dimensions(yolo["path"])
                                if dims:
                                    step_data["image_width"] = dims[0]
                                    step_data["image_height"] = dims[1]
                        elif category == "assert":
                            before = files_map.get("before_action_image", {})
                            after = files_map.get("after_action_image", {})
                            step_data["before_action_image_name"] = before.get("name")
                            step_data["before_action_image_path"] = before.get("path")
                            step_data["after_action_image_name"] = after.get("name")
                            step_data["after_action_image_path"] = after.get("path")
                            if before.get("path"):
                                dims = get_image_dimensions(before["path"])
                                if dims:
                                    step_data["image_width"] = dims[0]
                                    step_data["image_height"] = dims[1]

                        json_file = files_map.get("json", {})
                        if json_file.get("path"):
                            step_data["json_name"] = json_file["name"]
                            step_data["json_path"] = json_file["path"]
                            try:
                                with open(json_file["path"], "r", encoding="utf-8") as f:
                                    json_content = json.load(f)
                                perception_data = extract_perception_data(json_content, category)
                                step_data["raw_json_content"] = json.dumps(json_content, ensure_ascii=False)
                                if perception_data.get("normalized_detections"):
                                    step_data["normalized_detections_json"] = json.dumps(
                                        perception_data["normalized_detections"], ensure_ascii=False
                                    )
                                if perception_data.get("perception_infos_pre"):
                                    step_data["perception_infos_pre"] = json.dumps(
                                        perception_data["perception_infos_pre"], ensure_ascii=False
                                    )
                                if perception_data.get("perception_infos_post"):
                                    step_data["perception_infos_post"] = json.dumps(
                                        perception_data["perception_infos_post"], ensure_ascii=False
                                    )
                            except Exception as e:
                                errors.append(f"JSON parse error: {json_file['path']}: {e}")

                        insert_step(conn, step_data)
                        step_count += 1

        conn.commit()
    except Exception as e:
        conn.rollback()
        errors.append(f"Import failed: {str(e)}")
        return {"success": False, "task_count": len(task_set), "case_count": len(case_set),
                "step_count": step_count, "errors": errors}
    finally:
        conn.close()

    return {
        "success": True,
        "task_count": len(task_set),
        "case_count": len(case_set),
        "step_count": step_count,
        "errors": errors
    }
