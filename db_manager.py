import os
import json
import uuid
from datetime import datetime

DB_PATH = os.path.join(os.path.expanduser('~'), '.accessible_audiobook_player_db.json')
LIBRARY_DIR = os.path.join(os.path.expanduser('~'), 'Documents', 'Accessible Audiobook Player')

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
        if not os.path.exists(LIBRARY_DIR):
            try:
                os.makedirs(LIBRARY_DIR, exist_ok=True)
            except Exception as e:
                print("Error creating library directory", e)
        self.load_db()

    def to_portable_path(self, path):
        if not path:
            return path
        path = os.path.normpath(path)
        lib_dir = os.path.normpath(LIBRARY_DIR)
        if path.lower().startswith(lib_dir.lower()):
            rel = path[len(lib_dir):].lstrip(os.sep)
            return f"[LIBRARY]{os.sep}{rel}"
        return path

    def to_local_path(self, path):
        if not path:
            return path
        if path.startswith("[LIBRARY]"):
            rel = path[len("[LIBRARY]"):].lstrip(os.sep)
            return os.path.join(LIBRARY_DIR, rel)
        return path

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
        p_book_id = self.to_portable_path(book_id)
        self.data["history"][p_book_id] = {
            "bookId": p_book_id,
            "lastFilePath": self.to_portable_path(last_file_path),
            "lastPosition": last_position,
            "lastSpeed": last_speed,
            "lastVolume": last_volume,
            "lastPlayedAt": datetime.now().isoformat()
        }
        self.save_db()

    def get_history(self, book_id):
        p_book_id = self.to_portable_path(book_id)
        record = self.data["history"].get(p_book_id)
        if record:
            res = record.copy()
            res["bookId"] = self.to_local_path(res["bookId"])
            res["lastFilePath"] = self.to_local_path(res["lastFilePath"])
            return res
        return None

    def get_history_list(self):
        records = list(self.data["history"].values())
        records.sort(key=lambda x: x.get("lastPlayedAt", ""), reverse=True)
        local_records = []
        for r in records:
            rc = r.copy()
            rc["bookId"] = self.to_local_path(rc["bookId"])
            rc["lastFilePath"] = self.to_local_path(rc["lastFilePath"])
            local_records.append(rc)
        return local_records

    def get_bookmarks(self, book_id):
        p_book_id = self.to_portable_path(book_id)
        bms = self.data["bookmarks"].get(p_book_id, [])
        local_bms = []
        for bm in bms:
            bmc = bm.copy()
            bmc["bookId"] = self.to_local_path(bmc["bookId"])
            bmc["filePath"] = self.to_local_path(bmc["filePath"])
            local_bms.append(bmc)
        return local_bms

    def add_bookmark(self, book_id, file_path, timestamp, name, description):
        p_book_id = self.to_portable_path(book_id)
        p_file_path = self.to_portable_path(file_path)
        bm_id = str(uuid.uuid4())[:8]
        new_bm = {
            "id": bm_id,
            "bookId": p_book_id,
            "filePath": p_file_path,
            "timestamp": timestamp,
            "name": name or f"Bookmark at {timestamp}s",
            "description": description,
            "createdAt": datetime.now().isoformat()
        }
        if p_book_id not in self.data["bookmarks"]:
            self.data["bookmarks"][p_book_id] = []
        self.data["bookmarks"][p_book_id].append(new_bm)
        self.save_db()
        
        res = new_bm.copy()
        res["bookId"] = self.to_local_path(res["bookId"])
        res["filePath"] = self.to_local_path(res["filePath"])
        return res

    def delete_bookmark(self, book_id, bm_id):
        p_book_id = self.to_portable_path(book_id)
        if p_book_id in self.data["bookmarks"]:
            self.data["bookmarks"][p_book_id] = [b for b in self.data["bookmarks"][p_book_id] if b["id"] != bm_id]
            self.save_db()

    def get_highlights(self, book_id):
        p_book_id = self.to_portable_path(book_id)
        hls = self.data["highlights"].get(p_book_id, [])
        local_hls = []
        for hl in hls:
            hlc = hl.copy()
            hlc["bookId"] = self.to_local_path(hlc["bookId"])
            hlc["filePath"] = self.to_local_path(hlc["filePath"])
            local_hls.append(hlc)
        return local_hls

    def add_highlight(self, book_id, file_path, start, end, name, notes, tags, collection_id):
        p_book_id = self.to_portable_path(book_id)
        p_file_path = self.to_portable_path(file_path)
        hl_id = str(uuid.uuid4())[:8]
        new_hl = {
            "id": hl_id,
            "bookId": p_book_id,
            "filePath": p_file_path,
            "startTimestamp": start,
            "endTimestamp": end,
            "name": name or f"Highlight at {start}s",
            "notes": notes,
            "tags": [t.strip() for t in tags.split(",") if t.strip()],
            "collectionId": collection_id or None,
            "createdAt": datetime.now().isoformat()
        }
        if p_book_id not in self.data["highlights"]:
            self.data["highlights"][p_book_id] = []
        self.data["highlights"][p_book_id].append(new_hl)
        self.save_db()
        
        res = new_hl.copy()
        res["bookId"] = self.to_local_path(res["bookId"])
        res["filePath"] = self.to_local_path(res["filePath"])
        return res

    def delete_highlight(self, book_id, hl_id):
        p_book_id = self.to_portable_path(book_id)
        if p_book_id in self.data["highlights"]:
            self.data["highlights"][p_book_id] = [h for h in self.data["highlights"][p_book_id] if h["id"] != hl_id]
            self.save_db()

    def update_highlight(self, book_id, hl_id, updated_hl):
        p_book_id = self.to_portable_path(book_id)
        if p_book_id in self.data["highlights"]:
            for i, h in enumerate(self.data["highlights"][p_book_id]):
                if h["id"] == hl_id:
                    up_portable = updated_hl.copy()
                    up_portable["bookId"] = self.to_portable_path(updated_hl["bookId"])
                    up_portable["filePath"] = self.to_portable_path(updated_hl["filePath"])
                    self.data["highlights"][p_book_id][i] = up_portable
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
        p_book_id = self.to_portable_path(book_id)
        return {
            "skipped": [self.to_local_path(s) for s in self.data.get("skippedTracks", {}).get(p_book_id, [])],
            "order": [self.to_local_path(o) for o in self.data.get("trackOrder", {}).get(p_book_id, [])]
        }

    def save_playlist_settings(self, book_id, skipped, order):
        p_book_id = self.to_portable_path(book_id)
        if "skippedTracks" not in self.data:
            self.data["skippedTracks"] = {}
        if "trackOrder" not in self.data:
            self.data["trackOrder"] = {}
        self.data["skippedTracks"][p_book_id] = [self.to_portable_path(s) for s in skipped]
        self.data["trackOrder"][p_book_id] = [self.to_portable_path(o) for o in order]
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

    def export_book_data(self, book_id, dest):
        try:
            p_book_id = self.to_portable_path(book_id)
            export_payload = {
                "bookId": p_book_id,
                "bookmarks": self.data["bookmarks"].get(p_book_id, []),
                "highlights": self.data["highlights"].get(p_book_id, [])
            }
            with open(dest, 'w', encoding='utf-8') as f:
                json.dump(export_payload, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            print("Export book data error", e)
            return False

    def import_book_data(self, book_id, src):
        try:
            p_book_id = self.to_portable_path(book_id)
            with open(src, 'r', encoding='utf-8') as f:
                imported = json.load(f)
            if imported and imported.get("bookId") == p_book_id:
                self.data["bookmarks"][p_book_id] = imported.get("bookmarks", [])
                self.data["highlights"][p_book_id] = imported.get("highlights", [])
                self.save_db()
                return True, None
            else:
                return False, "Imported data bookId does not match the active audiobook ID"
        except Exception as e:
            print("Import book data error", e)
            return False, str(e)
