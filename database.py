"""
SQLite database layer for the test case viewer.
"""
import sqlite3
import os
import json
from datetime import datetime


DB_PATH = os.getenv("DB_PATH", "./data/app.db")


def get_db_path():
    return DB_PATH


def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            case_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(task_id, case_id),
            FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS steps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_pk INTEGER NOT NULL,
            task_id TEXT NOT NULL,
            case_id TEXT NOT NULL,
            category TEXT NOT NULL CHECK(category IN ('assert', 'operation')),
            step_base TEXT NOT NULL,
            step_num INTEGER,
            yolo_image_name TEXT,
            yolo_image_path TEXT,
            annotated_image_name TEXT,
            annotated_image_path TEXT,
            before_action_image_name TEXT,
            before_action_image_path TEXT,
            after_action_image_name TEXT,
            after_action_image_path TEXT,
            json_name TEXT,
            json_path TEXT,
            raw_json_content TEXT,
            normalized_detections_json TEXT,
            perception_infos_pre TEXT,
            perception_infos_post TEXT,
            image_width INTEGER,
            image_height INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (case_pk) REFERENCES cases(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_cases_task_id ON cases(task_id);
        CREATE INDEX IF NOT EXISTS idx_steps_case_pk ON steps(case_pk);
        CREATE INDEX IF NOT EXISTS idx_steps_step_num ON steps(step_num);
        CREATE INDEX IF NOT EXISTS idx_steps_task_case ON steps(task_id, case_id);
    """)
    conn.commit()
    conn.close()


def insert_task(conn, task_id: str) -> int:
    now = datetime.utcnow().isoformat()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR IGNORE INTO tasks (task_id, created_at, updated_at) VALUES (?, ?, ?)",
        (task_id, now, now)
    )
    cursor.execute("SELECT id FROM tasks WHERE task_id = ?", (task_id,))
    return cursor.fetchone()["id"]


def insert_case(conn, task_id: str, case_id: str) -> int:
    now = datetime.utcnow().isoformat()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR IGNORE INTO cases (task_id, case_id, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (task_id, case_id, now, now)
    )
    cursor.execute(
        "SELECT id FROM cases WHERE task_id = ? AND case_id = ?",
        (task_id, case_id)
    )
    return cursor.fetchone()["id"]


def insert_step(conn, step_data: dict) -> int:
    now = datetime.utcnow().isoformat()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO steps (
            case_pk, task_id, case_id, category, step_base, step_num,
            yolo_image_name, yolo_image_path,
            annotated_image_name, annotated_image_path,
            before_action_image_name, before_action_image_path,
            after_action_image_name, after_action_image_path,
            json_name, json_path,
            raw_json_content, normalized_detections_json,
            perception_infos_pre, perception_infos_post,
            image_width, image_height,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        step_data["case_pk"],
        step_data["task_id"],
        step_data["case_id"],
        step_data["category"],
        step_data["step_base"],
        step_data.get("step_num"),
        step_data.get("yolo_image_name"),
        step_data.get("yolo_image_path"),
        step_data.get("annotated_image_name"),
        step_data.get("annotated_image_path"),
        step_data.get("before_action_image_name"),
        step_data.get("before_action_image_path"),
        step_data.get("after_action_image_name"),
        step_data.get("after_action_image_path"),
        step_data.get("json_name"),
        step_data.get("json_path"),
        step_data.get("raw_json_content"),
        step_data.get("normalized_detections_json"),
        step_data.get("perception_infos_pre"),
        step_data.get("perception_infos_post"),
        step_data.get("image_width"),
        step_data.get("image_height"),
        now, now
    ))
    return cursor.lastrowid


def get_cases_by_task(conn, task_id: str) -> list:
    cursor = conn.cursor()
    cursor.execute(
        "SELECT case_id FROM cases WHERE task_id = ? ORDER BY case_id",
        (task_id,)
    )
    return [dict(row) for row in cursor.fetchall()]


def get_steps_by_case(conn, task_id: str, case_id: str) -> list:
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM steps
        WHERE task_id = ? AND case_id = ?
        ORDER BY
            CASE WHEN step_num IS NOT NULL THEN 0 ELSE 1 END,
            step_num ASC,
            step_base ASC
    """, (task_id, case_id))
    return [dict(row) for row in cursor.fetchall()]


def get_step_by_id(conn, step_id: int) -> dict | None:
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM steps WHERE id = ?", (step_id,))
    row = cursor.fetchone()
    return dict(row) if row else None


def task_exists(conn, task_id: str) -> bool:
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM tasks WHERE task_id = ?", (task_id,))
    return cursor.fetchone() is not None


def case_exists(conn, task_id: str, case_id: str) -> bool:
    cursor = conn.cursor()
    cursor.execute(
        "SELECT 1 FROM cases WHERE task_id = ? AND case_id = ?",
        (task_id, case_id)
    )
    return cursor.fetchone() is not None


def clear_task_data(conn, task_id: str):
    """Clear existing data for a task before re-import."""
    cursor = conn.cursor()
    cursor.execute("DELETE FROM steps WHERE task_id = ?", (task_id,))
    cursor.execute("DELETE FROM cases WHERE task_id = ?", (task_id,))
    cursor.execute("DELETE FROM tasks WHERE task_id = ?", (task_id,))


def load_memory_cache(conn) -> dict:
    """Load all data into memory cache for fast queries."""
    cache = {"tasks": {}, "cases": {}, "steps": {}}

    cursor = conn.cursor()
    cursor.execute("SELECT task_id FROM tasks")
    for row in cursor.fetchall():
        cache["tasks"][row["task_id"]] = True

    cursor.execute("SELECT task_id, case_id FROM cases")
    for row in cursor.fetchall():
        tid = row["task_id"]
        if tid not in cache["cases"]:
            cache["cases"][tid] = []
        cache["cases"][tid].append(row["case_id"])

    return cache
