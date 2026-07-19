import os
import json
import uuid
from datetime import datetime

DB_PATH = os.path.join(os.path.expanduser('~'), '.accessible_audiobook_player_db.json')

DEFAULT_DB = {
    "history": {},
    "bookmarks": {},
    "highlights": {},
    "stats": {},
    "settings": {
        "rewindSeconds": 3,
        "theme": "dark",
        "buttonSize": "normal",
        "defaultSpeed": 1.0,
        "verbosity": "normal"
    },
    "collections": [],
    "skippedTracks": {},
    "trackOrder": {}
}

class DBManager:
    def __init__(self):
        self.load_db()

    def load_db(self):
        if not os.path.exists(DB_PATH):
            self.data = DEFAULT_DB.copy()
            self.save_db()
        else:
            try:
                with open(DB_PATH, 'r', encoding='utf-8') as f:
                    self.data = json.load(f)
                # merge defaults to handle upgrades
                for k, v in DEFAULT_DB.items():
                    if k not in self.data:
                        self.data[k] = v
                if "settings" in self.data:
                    for sk, sv in DEFAULT_DB["settings"].items():
                        if sk not in self.data["settings"]:
                            self.data["settings"][sk] = sv
            except Exception as e:
                print("Error loading database, using defaults", e)
                self.data = DEFAULT_DB.copy()

    def save_db(self):
        try:
            with open(DB_PATH, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print("Error writing database", e)

    def save_history(self, book_id, last_file_path, last_position, last_speed, last_volume):
        self.data["history"][book_id] = {
            "bookId": book_id,
            "lastFilePath": last_file_path,
            "lastPosition": last_position,
            "lastSpeed": last_speed,
            "lastVolume": last_volume,
            "lastPlayedAt": datetime.now().isoformat()
        }
        self.save_db()

    def get_history(self, book_id):
        return self.data["history"].get(book_id)

    def get_history_list(self):
        records = list(self.data["history"].values())
        records.sort(key=lambda x: x.get("lastPlayedAt", ""), reverse=True)
        return records

    def get_bookmarks(self, book_id):
        return self.data["bookmarks"].get(book_id, [])

    def add_bookmark(self, book_id, file_path, timestamp, name, description):
        bm_id = str(uuid.uuid4())[:8]
        new_bm = {
            "id": bm_id,
            "bookId": book_id,
            "filePath": file_path,
            "timestamp": timestamp,
            "name": name or f"Bookmark at {timestamp}s",
            "description": description,
            "createdAt": datetime.now().isoformat()
        }
        if book_id not in self.data["bookmarks"]:
            self.data["bookmarks"][book_id] = []
        self.data["bookmarks"][book_id].append(new_bm)
        self.save_db()
        return new_bm

    def delete_bookmark(self, book_id, bm_id):
        if book_id in self.data["bookmarks"]:
            self.data["bookmarks"][book_id] = [b for b in self.data["bookmarks"][book_id] if b["id"] != bm_id]
            self.save_db()

    def get_highlights(self, book_id):
        return self.data["highlights"].get(book_id, [])

    def add_highlight(self, book_id, file_path, start, end, name, notes, tags, collection_id):
        hl_id = str(uuid.uuid4())[:8]
        new_hl = {
            "id": hl_id,
            "bookId": book_id,
            "filePath": file_path,
            "startTimestamp": start,
            "endTimestamp": end,
            "name": name or f"Highlight at {start}s",
            "notes": notes,
            "tags": [t.strip() for t in tags.split(",") if t.strip()],
            "collectionId": collection_id or None,
            "createdAt": datetime.now().isoformat()
        }
        if book_id not in self.data["highlights"]:
            self.data["highlights"][book_id] = []
        self.data["highlights"][book_id].append(new_hl)
        self.save_db()
        return new_hl

    def delete_highlight(self, book_id, hl_id):
        if book_id in self.data["highlights"]:
            self.data["highlights"][book_id] = [h for h in self.data["highlights"][book_id] if h["id"] != hl_id]
            self.save_db()

    def update_highlight(self, book_id, hl_id, updated_hl):
        if book_id in self.data["highlights"]:
            for i, h in enumerate(self.data["highlights"][book_id]):
                if h["id"] == hl_id:
                    self.data["highlights"][book_id][i] = updated_hl
                    self.save_db()
                    break

    def get_collections(self):
        return self.data.get("collections", [])

    def save_collections(self, collections):
        self.data["collections"] = collections
        self.save_db()

    def get_settings(self):
        return self.data.get("settings", DEFAULT_DB["settings"])

    def save_settings(self, settings):
        self.data["settings"] = settings
        self.save_db()

    def get_playlist_settings(self, book_id):
        return {
            "skipped": self.data.get("skippedTracks", {}).get(book_id, []),
            "order": self.data.get("trackOrder", {}).get(book_id, [])
        }

    def save_playlist_settings(self, book_id, skipped, order):
        if "skippedTracks" not in self.data:
            self.data["skippedTracks"] = {}
        if "trackOrder" not in self.data:
            self.data["trackOrder"] = {}
        self.data["skippedTracks"][book_id] = skipped
        self.data["trackOrder"][book_id] = order
        self.save_db()

    def increment_daily_stats(self, seconds):
        today = datetime.now().strftime("%Y-%m-%d")
        if "stats" not in self.data:
            self.data["stats"] = {}
        self.data["stats"][today] = self.data["stats"].get(today, 0) + seconds
        self.save_db()

    def get_stats(self):
        return self.data.get("stats", {})

    def backup_db(self, dest):
        try:
            with open(dest, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            print("Backup error", e)
            return False

    def restore_db(self, src):
        try:
            with open(src, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self.data = data
            self.save_db()
            return True
        except Exception as e:
            print("Restore error", e)
            return False
