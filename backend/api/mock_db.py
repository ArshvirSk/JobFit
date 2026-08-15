import json
import os
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_FILE = os.path.join(os.path.dirname(__file__), "..", "mock_db.json")

def _init_db():
    if not os.path.exists(DB_FILE):
        default_data = {
            "users": {
                "usr_mock_123": {
                    "id": "usr_mock_123",
                    "name": "Arshvir Singh Kalsi",
                    "email": "test@example.com",
                    "plan_tier": "free",
                    "credits_used": 0,
                    "credits_limit": 3
                }
            },
            "base_resumes": [],
            "applications": []
        }
        _save_db(default_data)

def _load_db() -> Dict[str, Any]:
    _init_db()
    with open(DB_FILE, "r") as f:
        return json.load(f)

def _save_db(data: Dict[str, Any]):
    with open(DB_FILE, "w") as f:
        json.dump(data, f, indent=2)

class MockDB:
    # Users
    @staticmethod
    def get_user(user_id: str) -> Optional[Dict[str, Any]]:
        db = _load_db()
        return db.get("users", {}).get(user_id)
        
    @staticmethod
    def increment_credits(user_id: str) -> bool:
        db = _load_db()
        user = db.get("users", {}).get(user_id)
        if user:
            if user["plan_tier"] == "free" and user["credits_used"] >= user["credits_limit"]:
                return False
            user["credits_used"] += 1
            _save_db(db)
            return True
        return False
        
    @staticmethod
    def upgrade_user(user_id: str, plan_tier: str = "pro") -> bool:
        db = _load_db()
        user = db.get("users", {}).get(user_id)
        if user:
            user["plan_tier"] = plan_tier
            _save_db(db)
            return True
        return False

    # Resumes
    @staticmethod
    def get_resumes(user_id: str) -> List[Dict[str, Any]]:
        db = _load_db()
        return [r for r in db.get("base_resumes", []) if r["user_id"] == user_id]

    @staticmethod
    def add_resume(user_id: str, label: str, raw_text: str) -> Dict[str, Any]:
        db = _load_db()
        new_resume = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "label": label,
            "raw_text": raw_text,
            "created_at": datetime.utcnow().isoformat()
        }
        db.setdefault("base_resumes", []).append(new_resume)
        _save_db(db)
        return new_resume

    @staticmethod
    def delete_resume(user_id: str, resume_id: str) -> bool:
        db = _load_db()
        initial_len = len(db.get("base_resumes", []))
        db["base_resumes"] = [r for r in db.get("base_resumes", []) if not (r["id"] == resume_id and r["user_id"] == user_id)]
        _save_db(db)
        return len(db["base_resumes"]) < initial_len

    @staticmethod
    def get_resume_by_id(resume_id: str) -> Optional[Dict[str, Any]]:
        db = _load_db()
        for r in db.get("base_resumes", []):
            if r["id"] == resume_id:
                return r
        return None

    # Applications (Tracker)
    @staticmethod
    def get_applications(user_id: str) -> List[Dict[str, Any]]:
        db = _load_db()
        return [a for a in db.get("applications", []) if a["user_id"] == user_id]

    @staticmethod
    def add_application(user_id: str, company: str, role: str, status: str = "Applied", notes: str = "") -> Dict[str, Any]:
        db = _load_db()
        new_app = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "company": company,
            "role": role,
            "status": status,
            "applied_at": datetime.utcnow().isoformat(),
            "notes": notes
        }
        db.setdefault("applications", []).append(new_app)
        _save_db(db)
        return new_app
        
    @staticmethod
    def update_application_status(user_id: str, app_id: str, status: str) -> Optional[Dict[str, Any]]:
        db = _load_db()
        for app in db.get("applications", []):
            if app["id"] == app_id and app["user_id"] == user_id:
                app["status"] = status
                _save_db(db)
                return app
        return None

    @staticmethod
    def update_application(user_id: str, app_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        db = _load_db()
        for app in db.get("applications", []):
            if app["id"] == app_id and app["user_id"] == user_id:
                if "company" in data:
                    app["company"] = data["company"]
                if "role" in data:
                    app["role"] = data["role"]
                if "status" in data:
                    app["status"] = data["status"]
                if "notes" in data:
                    app["notes"] = data["notes"]
                _save_db(db)
                return app
        return None

    @staticmethod
    def delete_application(user_id: str, app_id: str) -> bool:
        db = _load_db()
        initial_len = len(db.get("applications", []))
        db["applications"] = [a for a in db.get("applications", []) if not (a["id"] == app_id and a["user_id"] == user_id)]
        _save_db(db)
        return len(db["applications"]) < initial_len
