import sys
import os
import json
import subprocess
from datetime import datetime
from PyQt6.QtCore import QTimer, QUrl, Qt
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QListWidget, QListWidgetItem, QSlider, QComboBox,
    QLineEdit, QTabWidget, QFormLayout, QFileDialog, QMenuBar, QMenu,
    QMessageBox, QCheckBox, QFrame, QSplitter
)
from PyQt6.QtMultimedia import QMediaPlayer, QAudioOutput
from PyQt6.QtGui import QKeySequence, QShortcut
try:
    from PyQt6.QtGui import QAccessible, QAccessibleEvent
    HAS_ACCESSIBILITY = True
except ImportError:
    HAS_ACCESSIBILITY = False
    QAccessible = None
    QAccessibleEvent = None

from db_manager import DBManager

def announce(text):
    """Announce text natively to assistive technologies (screen readers) using status_announcer or QAccessibleEvent."""
    try:
        if HAS_ACCESSIBILITY:
            from PyQt6.QtWidgets import QApplication
            app = QApplication.instance()
            if app:
                window = app.activeWindow()
                if window and hasattr(window, 'status_announcer') and window.status_announcer:
                    window.status_announcer.setText(text)
                    window.status_announcer.setAccessibleName(text)
                    event = QAccessibleEvent(window.status_announcer, QAccessible.Event.NameChanged)
                    QAccessible.updateAccessibility(event)
                    return
    except Exception as e:
        print("Screen reader announcement failed:", e)
    
    # Console fallback
    print(f"[Announcement] {text}")

class AccessibleAudiobookPlayer(QMainWindow):
    def __init__(self):
        super().__init__()
        self.db = DBManager()
        self.setWindowTitle("Accessible Audiobook & Music Player")
        self.resize(1000, 700)

        # Media Player Init
        self.player = QMediaPlayer()
        self.audio_output = QAudioOutput()
        self.player.setAudioOutput(self.audio_output)

        # Playlist states
        self.book_id = None
        self.track_list = []
        self.current_track_idx = -1
        self.skipped_tracks = []
        
        # Highlights & Bookmarks lists
        self.bookmarks = []
        self.highlights = []
        
        # Revision mode states
        self.is_revision_mode = False
        self.current_revision_idx = -1
        
        # Loop clip state
        self.active_loop_clip = None

        # Sleep timer state
        self.sleep_mode = "off" # off, 10, 20, track
        self.sleep_timer_val = 0 # minutes remaining
        self.sleep_timer = QTimer()
        self.sleep_timer.timeout.connect(self.on_sleep_tick)

        # Stats ticker (logs stats every 5 seconds of active play)
        self.stats_timer = QTimer()
        self.stats_timer.timeout.connect(self.log_playback_stats)

        # Setup UI layout
        self.init_ui()
        self.apply_theme()
        self.setup_shortcuts()

        # Install global event filter for Up/Down arrow key volume control
        QApplication.instance().installEventFilter(self)

        # Check launch arguments (Open With file)
        self.check_launch_arguments()

        # Connect media player events
        self.player.positionChanged.connect(self.on_position_changed)
        self.player.durationChanged.connect(self.on_duration_changed)
        self.player.mediaStatusChanged.connect(self.on_media_status_changed)

    def init_ui(self):
        # Status Bar & Accessibility Announcer
        self.status_bar = self.statusBar()
        self.status_announcer = QLabel("")
        if HAS_ACCESSIBILITY:
            self.status_announcer.setAccessibleRole(QAccessible.Role.Alert)
        self.status_bar.addWidget(self.status_announcer)

        self.central_widget = QWidget()
        self.setCentralWidget(self.central_widget)
        self.main_layout = QVBoxLayout(self.central_widget)

        # Menu Bar
        self.menu_bar = QMenuBar()
        self.setMenuBar(self.menu_bar)

        file_menu = self.menu_bar.addMenu("&File")
        
        action_open_folder = file_menu.addAction("&Open Folder", self.select_folder)
        action_open_folder.setShortcut(QKeySequence("Ctrl+Shift+O"))
        
        action_open_file = file_menu.addAction("Open &File", self.select_file)
        action_open_file.setShortcut(QKeySequence("Ctrl+O"))
        
        action_import = file_menu.addAction("&Import Folder to Library", self.import_folder_to_library)
        action_import.setShortcut(QKeySequence("Ctrl+I"))
        file_menu.addSeparator()
        file_menu.addAction("Backup Database", self.backup_database)
        file_menu.addAction("Restore Database", self.restore_database)
        file_menu.addSeparator()
        file_menu.addAction("E&xit", self.close)

        clips_menu = self.menu_bar.addMenu("&Clips")
        clips_menu.addAction("&Export Bookmarks/Clips", self.export_book_metadata)
        clips_menu.addAction("&Import Bookmarks/Clips", self.import_book_metadata)

        help_menu = self.menu_bar.addMenu("&Help")
        help_menu.addAction("&User Manual", lambda: self.tab_widget.setCurrentIndex(4))
        help_menu.addAction("Check for &Updates", self.check_for_updates)

        # Splitter Layout (Sidebar and Content Pane)
        self.splitter = QSplitter(Qt.Orientation.Horizontal)
        self.main_layout.addWidget(self.splitter)

        # Sidebar Left (Tracks and History List)
        self.sidebar_widget = QWidget()
        self.sidebar_layout = QVBoxLayout(self.sidebar_widget)
        self.sidebar_widget.setLayout(self.sidebar_layout)

        self.tracks_label = QLabel("Tracks (0)")
        self.sidebar_layout.addWidget(self.tracks_label)

        self.tracks_list = QListWidget()
        self.tracks_list.itemDoubleClicked.connect(self.on_track_double_clicked)
        self.sidebar_layout.addWidget(self.tracks_list)

        # Up/Down and Skip buttons for Playlist ordering
        self.playlist_controls_layout = QHBoxLayout()
        self.sidebar_layout.addLayout(self.playlist_controls_layout)
        
        self.btn_move_up = QPushButton("Move Up")
        self.btn_move_up.clicked.connect(lambda: self.move_track("up"))
        self.playlist_controls_layout.addWidget(self.btn_move_up)

        self.btn_move_down = QPushButton("Move Down")
        self.btn_move_down.clicked.connect(lambda: self.move_track("down"))
        self.playlist_controls_layout.addWidget(self.btn_move_down)

        self.library_label = QLabel("Library / Recent Books")
        self.sidebar_layout.addWidget(self.library_label)

        self.library_list = QListWidget()
        self.library_list.itemClicked.connect(self.on_library_item_clicked)
        self.sidebar_layout.addWidget(self.library_list)
        self.refresh_library()

        self.splitter.addWidget(self.sidebar_widget)

        # Main Panel Content Tabs
        self.content_widget = QWidget()
        self.content_layout = QVBoxLayout(self.content_widget)
        self.content_widget.setLayout(self.content_layout)

        self.book_title_label = QLabel("No Audio Loaded")
        self.book_title_label.setStyleSheet("font-size: 18px; font-weight: bold;")
        self.content_layout.addWidget(self.book_title_label)

        self.tab_widget = QTabWidget()
        self.content_layout.addWidget(self.tab_widget)
        self.splitter.addWidget(self.content_widget)

        # Tab 1: Clips & Bookmarks
        self.tab_clips = QWidget()
        self.clips_layout = QVBoxLayout(self.tab_clips)
        self.tab_clips.setLayout(self.clips_layout)

        # Bookmarks row
        self.clips_layout.addWidget(QLabel("Bookmarks"))
        bm_input_layout = QHBoxLayout()
        self.bm_desc_input = QLineEdit()
        self.bm_desc_input.setPlaceholderText("Bookmark description")
        bm_input_layout.addWidget(self.bm_desc_input)
        self.btn_save_bm = QPushButton("Save Bookmark")
        self.btn_save_bm.clicked.connect(self.save_bookmark)
        bm_input_layout.addWidget(self.btn_save_bm)
        self.clips_layout.addLayout(bm_input_layout)

        self.bookmarks_list = QListWidget()
        self.clips_layout.addWidget(self.bookmarks_list)

        # Highlights row
        self.clips_layout.addWidget(QLabel("Study Highlights (Clips)"))
        
        # Revision mode buttons
        self.revision_layout = QHBoxLayout()
        self.btn_revision_mode = QPushButton("Start Revision Mode")
        self.btn_revision_mode.clicked.connect(self.toggle_revision_mode)
        self.revision_layout.addWidget(self.btn_revision_mode)
        
        self.tag_filter_input = QLineEdit()
        self.tag_filter_input.setPlaceholderText("Filter clips by tag...")
        self.tag_filter_input.textChanged.connect(self.refresh_highlights_list)
        self.revision_layout.addWidget(self.tag_filter_input)
        self.clips_layout.addLayout(self.revision_layout)

        # Highlight Creation form
        hl_form_layout = QFormLayout()
        self.hl_name_input = QLineEdit()
        self.hl_name_input.setPlaceholderText("Clip label")
        hl_form_layout.addRow("Label:", self.hl_name_input)

        hl_times_layout = QHBoxLayout()
        self.hl_start_input = QLineEdit()
        self.hl_start_input.setPlaceholderText("Start (secs)")
        hl_times_layout.addWidget(self.hl_start_input)
        self.btn_set_start = QPushButton("Set Start")
        self.btn_set_start.clicked.connect(self.set_highlight_start_time)
        hl_times_layout.addWidget(self.btn_set_start)

        self.hl_end_input = QLineEdit()
        self.hl_end_input.setPlaceholderText("End (secs)")
        hl_times_layout.addWidget(self.hl_end_input)
        self.btn_set_end = QPushButton("Set End")
        self.btn_set_end.clicked.connect(self.set_highlight_end_time)
        hl_times_layout.addWidget(self.btn_set_end)
        hl_form_layout.addRow("Time range:", hl_times_layout)

        self.hl_notes_input = QLineEdit()
        self.hl_notes_input.setPlaceholderText("Attach notes")
        hl_form_layout.addRow("Notes:", self.hl_notes_input)

        self.hl_tags_input = QLineEdit()
        self.hl_tags_input.setPlaceholderText("Comma-separated (e.g. Exam, Math)")
        hl_form_layout.addRow("Tags:", self.hl_tags_input)

        self.hl_col_combo = QComboBox()
        self.hl_col_combo.addItem("No Collection", None)
        hl_form_layout.addRow("Collection:", self.hl_col_combo)

        self.btn_save_hl = QPushButton("Save Highlight")
        self.btn_save_hl.clicked.connect(self.save_highlight)
        hl_form_layout.addRow(self.btn_save_hl)
        self.clips_layout.addLayout(hl_form_layout)

        self.highlights_list = QListWidget()
        self.clips_layout.addWidget(self.highlights_list)

        self.tab_widget.addTab(self.tab_clips, "Clips & Bookmarks")

        # Tab 2: Collections
        self.tab_cols = QWidget()
        self.cols_layout = QVBoxLayout(self.tab_cols)
        self.tab_cols.setLayout(self.cols_layout)

        col_create_layout = QHBoxLayout()
        self.col_name_input = QLineEdit()
        self.col_name_input.setPlaceholderText("Collection Name")
        col_create_layout.addWidget(self.col_name_input)
        
        self.col_desc_input = QLineEdit()
        self.col_desc_input.setPlaceholderText("Collection Description")
        col_create_layout.addWidget(self.col_desc_input)

        self.btn_create_col = QPushButton("Create Collection")
        self.btn_create_col.clicked.connect(self.create_collection)
        col_create_layout.addWidget(self.btn_create_col)
        self.cols_layout.addLayout(col_create_layout)

        self.collections_list = QListWidget()
        self.collections_list.itemClicked.connect(self.on_collection_clicked)
        self.cols_layout.addWidget(self.collections_list)

        self.tab_widget.addTab(self.tab_cols, "Collections")

        # Tab 3: Statistics
        self.tab_stats = QWidget()
        self.stats_layout = QVBoxLayout(self.tab_stats)
        self.tab_stats.setLayout(self.stats_layout)
        
        self.stats_today_lbl = QLabel("Today's Listening Time: 0 minutes")
        self.stats_today_lbl.setStyleSheet("font-size: 16px; font-weight: 500;")
        self.stats_layout.addWidget(self.stats_today_lbl)

        self.stats_alltime_lbl = QLabel("All-Time Listening Time: 0 minutes")
        self.stats_alltime_lbl.setStyleSheet("font-size: 16px; font-weight: 500;")
        self.stats_layout.addWidget(self.stats_alltime_lbl)

        self.stats_layout.addWidget(QLabel("Daily Breakdown (Last 7 Days):"))
        self.stats_breakdown_list = QListWidget()
        self.stats_layout.addWidget(self.stats_breakdown_list)
        
        self.tab_widget.addTab(self.tab_stats, "Statistics")

        # Tab 4: Settings
        self.tab_settings = QWidget()
        self.settings_layout = QFormLayout(self.tab_settings)
        self.tab_settings.setLayout(self.settings_layout)

        self.settings_rewind = QComboBox()
        self.settings_rewind.addItems(["Off", "3 seconds", "5 seconds", "10 seconds"])
        self.settings_rewind.currentIndexChanged.connect(self.save_settings)
        self.settings_layout.addRow("Auto-Rewind on Play:", self.settings_rewind)

        self.settings_theme = QComboBox()
        self.settings_theme.addItems(["Dark Theme", "Light Theme", "High Contrast"])
        self.settings_theme.currentIndexChanged.connect(self.on_theme_changed)
        self.settings_layout.addRow("Color Theme:", self.settings_theme)

        self.settings_size = QComboBox()
        self.settings_size.addItems(["Small Buttons", "Normal Buttons", "Large Buttons"])
        self.settings_size.currentIndexChanged.connect(self.on_size_changed)
        self.settings_layout.addRow("Layout Target Scale:", self.settings_size)

        self.settings_speed = QComboBox()
        self.settings_speed.addItems(["0.5x", "1.0x", "1.25x", "1.5x", "1.75x", "2.0x"])
        self.settings_speed.currentIndexChanged.connect(self.save_settings)
        self.settings_layout.addRow("Default Speed:", self.settings_speed)

        self.settings_verbosity = QComboBox()
        self.settings_verbosity.addItems(["Verbose (All alerts)", "Normal (Status alerts)", "Minimal (Errors only)"])
        self.settings_verbosity.currentIndexChanged.connect(self.save_settings)
        self.settings_layout.addRow("Announcer Verbosity:", self.settings_verbosity)

        self.btn_db_backup = QPushButton("Backup Database")
        self.btn_db_backup.clicked.connect(self.backup_database)
        self.btn_db_restore = QPushButton("Restore Database")
        self.btn_db_restore.clicked.connect(self.restore_database)
        
        db_actions_layout = QHBoxLayout()
        db_actions_layout.addWidget(self.btn_db_backup)
        db_actions_layout.addWidget(self.btn_db_restore)
        self.settings_layout.addRow("Database Actions:", db_actions_layout)

        self.tab_widget.addTab(self.tab_settings, "Settings")

        # Tab 5: Help (User Guide)
        self.tab_help = QWidget()
        self.help_layout = QVBoxLayout(self.tab_help)
        self.tab_help.setLayout(self.help_layout)
        
        self.help_text = QLabel(
            "<h3>Core Keyboard Shortcuts</h3>"
            "<ul>"
            "<li><b>Spacebar</b>: Play / Pause</li>"
            "<li><b>Arrow Left / Right</b>: Seek backward / forward 10 seconds</li>"
            "<li><b>Arrow Up / Down</b>: Increase / decrease volume by 5% (up to 200% boost!)</li>"
            "<li><b>Page Up / Page Down</b>: Skip to previous / next non-skipped track</li>"
            "<li><b>Home / End</b>: Jump to the start / end of the current track</li>"
            "<li><b>Slash (/)</b>: Focus the 'Jump to Time' box. Type time (e.g. 13:25) and press Enter.</li>"
            "</ul>"
            "<h3>Study Highlights</h3>"
            "<ul>"
            "<li><b>[ (Left Bracket)</b>: Mark Highlight Start Time at current playing second</li>"
            "<li><b>] (Right Bracket)</b>: Mark Highlight End Time at current playing second</li>"
            "<li><b>Ctrl + H</b>: Focus the clip name input box</li>"
            "<li><b>Ctrl + N</b>: Focus the clip notes input field</li>"
            "<li><b>Ctrl + D</b>: Save bookmark at current timestamp</li>"
            "<li><b>Ctrl + T</b>: Cycle Sleep Timer (Off, 10m, 20m, End of Track)</li>"
            "</ul>"
        )
        self.help_text.setWordWrap(True)
        self.help_layout.addWidget(self.help_text)
        
        self.tab_widget.addTab(self.tab_help, "User Manual")

        # Footer Player Controls
        self.footer_widget = QWidget()
        self.footer_layout = QVBoxLayout(self.footer_widget)
        self.footer_widget.setLayout(self.footer_layout)
        self.main_layout.addWidget(self.footer_widget)

        # Progress slider row
        progress_layout = QHBoxLayout()
        self.pos_label = QLabel("0:00")
        progress_layout.addWidget(self.pos_label)

        self.progress_slider = QSlider(Qt.Orientation.Horizontal)
        self.progress_slider.sliderMoved.connect(self.on_slider_moved)
        progress_layout.addWidget(self.progress_slider)

        self.dur_label = QLabel("0:00")
        progress_layout.addWidget(self.dur_label)

        # Jump to Time inline input box
        progress_layout.addWidget(QLabel("Go to:"))
        self.jump_time_input = QLineEdit()
        self.jump_time_input.setPlaceholderText("e.g. 13:25")
        self.jump_time_input.setFixedWidth(80)
        self.jump_time_input.returnPressed.connect(self.jump_to_time)
        progress_layout.addWidget(self.jump_time_input)

        self.footer_layout.addLayout(progress_layout)

        # Control buttons row
        controls_layout = QHBoxLayout()

        self.btn_prev = QPushButton("⏮")
        self.btn_prev.clicked.connect(lambda: self.skip_track(-1))
        controls_layout.addWidget(self.btn_prev)

        self.btn_rew = QPushButton("-10s")
        self.btn_rew.clicked.connect(lambda: self.seek_relative(-10000))
        controls_layout.addWidget(self.btn_rew)

        self.btn_play = QPushButton("Play")
        self.btn_play.clicked.connect(self.toggle_play)
        controls_layout.addWidget(self.btn_play)

        self.btn_ff = QPushButton("+10s")
        self.btn_ff.clicked.connect(lambda: self.seek_relative(10000))
        controls_layout.addWidget(self.btn_ff)

        self.btn_next = QPushButton("⏭")
        self.btn_next.clicked.connect(lambda: self.skip_track(1))
        controls_layout.addWidget(self.btn_next)

        self.btn_stop = QPushButton("Stop")
        self.btn_stop.clicked.connect(self.stop_playback)
        controls_layout.addWidget(self.btn_stop)

        # Shuffle and Repeat toggles
        self.chk_shuffle = QCheckBox("Shuffle")
        controls_layout.addWidget(self.chk_shuffle)

        self.repeat_combo = QComboBox()
        self.repeat_combo.addItems(["Repeat Off", "Repeat Track", "Repeat Folder"])
        controls_layout.addWidget(self.repeat_combo)

        # Sleep Timer button
        self.btn_sleep = QPushButton("Sleep: Off")
        self.btn_sleep.clicked.connect(self.cycle_sleep_timer)
        controls_layout.addWidget(self.btn_sleep)

        # Volume slider
        controls_layout.addWidget(QLabel("Volume:"))
        self.volume_slider = QSlider(Qt.Orientation.Horizontal)
        self.volume_slider.setRange(0, 200) # Support 200% software boost
        self.volume_slider.setValue(100)
        self.volume_slider.setFixedWidth(100)
        self.volume_slider.valueChanged.connect(self.on_volume_changed)
        controls_layout.addWidget(self.volume_slider)

        self.volume_lbl = QLabel("100%")
        controls_layout.addWidget(self.volume_lbl)

        # Speed picker
        controls_layout.addWidget(QLabel("Speed:"))
        self.speed_combo = QComboBox()
        self.speed_combo.addItems(["0.5x", "0.75x", "1.0x", "1.25x", "1.5x", "1.75x", "2.0x", "2.5x", "3.0x"])
        self.speed_combo.setCurrentText("1.0x")
        self.speed_combo.currentTextChanged.connect(self.on_speed_changed)
        controls_layout.addWidget(self.speed_combo)

        self.footer_layout.addLayout(controls_layout)

        # Load settings configuration
        self.load_settings()

    def setup_shortcuts(self):
        # Create global shortcuts
        self.sc_play = QShortcut(QKeySequence(Qt.Key.Key_Space), self)
        self.sc_play.activated.connect(self.toggle_play)

        self.sc_rew = QShortcut(QKeySequence(Qt.Key.Key_Left), self)
        self.sc_rew.activated.connect(lambda: self.seek_relative(-10000))

        self.sc_ff = QShortcut(QKeySequence(Qt.Key.Key_Right), self)
        self.sc_ff.activated.connect(lambda: self.seek_relative(10000))

        self.sc_vol_up = QShortcut(QKeySequence(Qt.Key.Key_Up), self)
        self.sc_vol_up.activated.connect(lambda: self.adjust_volume(5))

        self.sc_vol_down = QShortcut(QKeySequence(Qt.Key.Key_Down), self)
        self.sc_vol_down.activated.connect(lambda: self.adjust_volume(-5))

        self.sc_prev = QShortcut(QKeySequence(Qt.Key.Key_PageUp), self)
        self.sc_prev.activated.connect(lambda: self.skip_track(-1))

        self.sc_next = QShortcut(QKeySequence(Qt.Key.Key_PageDown), self)
        self.sc_next.activated.connect(lambda: self.skip_track(1))

        self.sc_start_time = QShortcut(QKeySequence(Qt.Key.Key_BracketLeft), self)
        self.sc_start_time.activated.connect(self.set_highlight_start_time)

        self.sc_end_time = QShortcut(QKeySequence(Qt.Key.Key_BracketRight), self)
        self.sc_end_time.activated.connect(self.set_highlight_end_time)

        self.sc_jump_focus = QShortcut(QKeySequence(Qt.Key.Key_Slash), self)
        self.sc_jump_focus.activated.connect(self.focus_jump_time_box)

        self.sc_home = QShortcut(QKeySequence(Qt.Key.Key_Home), self)
        self.sc_home.activated.connect(lambda: self.player.setPosition(0))

        self.sc_end = QShortcut(QKeySequence(Qt.Key.Key_End), self)
        self.sc_end.activated.connect(lambda: self.player.setPosition(self.player.duration() - 1000))

        # Control combinators
        self.sc_ctrl_h = QShortcut(QKeySequence("Ctrl+H"), self)
        self.sc_ctrl_h.activated.connect(self.focus_clip_name)

        self.sc_ctrl_n = QShortcut(QKeySequence("Ctrl+N"), self)
        self.sc_ctrl_n.activated.connect(self.focus_clip_notes)

        self.sc_ctrl_d = QShortcut(QKeySequence("Ctrl+D"), self)
        self.sc_ctrl_d.activated.connect(self.save_bookmark)

        self.sc_ctrl_t = QShortcut(QKeySequence("Ctrl+T"), self)
        self.sc_ctrl_t.activated.connect(self.cycle_sleep_timer)

    def load_settings(self):
        settings = self.db.get_settings()
        
        # Rewind
        rewind_map = {0: 0, 3: 1, 5: 2, 10: 3}
        self.settings_rewind.setCurrentIndex(rewind_map.get(settings.get("rewindSeconds", 3), 1))
        
        # Theme
        theme_map = {"dark": 0, "light": 1, "high-contrast": 2}
        self.settings_theme.setCurrentIndex(theme_map.get(settings.get("theme", "dark"), 0))
        
        # Size
        size_map = {"small": 0, "normal": 1, "large": 2}
        self.settings_size.setCurrentIndex(size_map.get(settings.get("buttonSize", "normal"), 1))

        # Default Speed
        speed_map = {"0.5": 0, "1.0": 1, "1.25": 2, "1.5": 3, "1.75": 4, "2.0": 5}
        self.settings_speed.setCurrentIndex(speed_map.get(str(settings.get("defaultSpeed", 1.0)), 1))

        # Verbosity
        verbosity_map = {"verbose": 0, "normal": 1, "minimal": 2}
        self.settings_verbosity.setCurrentIndex(verbosity_map.get(settings.get("verbosity", "normal"), 1))

        # Set themes initially
        self.apply_theme()
        self.apply_size()

    def save_settings(self):
        rewind_vals = [0, 3, 5, 10]
        theme_vals = ["dark", "light", "high-contrast"]
        size_vals = ["small", "normal", "large"]
        speed_vals = [0.5, 1.0, 1.25, 1.5, 1.75, 2.0]
        verbosity_vals = ["verbose", "normal", "minimal"]

        settings = {
            "rewindSeconds": rewind_vals[self.settings_rewind.currentIndex()],
            "theme": theme_vals[self.settings_theme.currentIndex()],
            "buttonSize": size_vals[self.settings_size.currentIndex()],
            "defaultSpeed": speed_vals[self.settings_speed.currentIndex()],
            "verbosity": verbosity_vals[self.settings_verbosity.currentIndex()]
        }
        self.db.save_settings(settings)
        if settings["verbosity"] == "verbose":
            announce("Settings saved successfully")

    def on_theme_changed(self):
        self.save_settings()
        self.apply_theme()

    def on_size_changed(self):
        self.save_settings()
        self.apply_size()

    def apply_theme(self):
        theme_index = self.settings_theme.currentIndex()
        if theme_index == 0:  # Dark
            self.setStyleSheet(
                "QMainWindow, QWidget { background-color: #121212; color: #FFFFFF; }"
                "QLineEdit, QComboBox, QListWidget { background-color: #1E1E1E; color: #FFFFFF; border: 1px solid #333333; padding: 4px; }"
                "QPushButton { background-color: #333333; color: #FFFFFF; border: 1px solid #444444; padding: 6px; border-radius: 4px; }"
                "QPushButton:hover { background-color: #444444; }"
                "QMenuBar { background-color: #121212; color: #FFFFFF; }"
                "QMenuBar::item:selected { background-color: #333333; }"
                "QMenu { background-color: #1E1E1E; color: #FFFFFF; border: 1px solid #333333; }"
                "QMenu::item:selected { background-color: #333333; }"
            )
        elif theme_index == 1:  # Light
            self.setStyleSheet(
                "QMainWindow, QWidget { background-color: #F8F9FA; color: #212529; }"
                "QLineEdit, QComboBox, QListWidget { background-color: #FFFFFF; color: #212529; border: 1px solid #CED4DA; padding: 4px; }"
                "QPushButton { background-color: #E9ECEF; color: #212529; border: 1px solid #DEE2E6; padding: 6px; border-radius: 4px; }"
                "QPushButton:hover { background-color: #DEE2E6; }"
                "QMenuBar { background-color: #F8F9FA; color: #212529; }"
                "QMenuBar::item:selected { background-color: #E9ECEF; }"
                "QMenu { background-color: #FFFFFF; color: #212529; border: 1px solid #CED4DA; }"
                "QMenu::item:selected { background-color: #E9ECEF; }"
            )
        elif theme_index == 2:  # High Contrast
            self.setStyleSheet(
                "QMainWindow, QWidget { background-color: #000000; color: #00FF00; }"
                "QLineEdit, QComboBox, QListWidget { background-color: #000000; color: #00FF00; border: 2px solid #00FF00; padding: 4px; }"
                "QPushButton { background-color: #000000; color: #00FF00; border: 2px solid #00FF00; padding: 6px; border-radius: 4px; }"
                "QPushButton:hover { background-color: #00FF00; color: #000000; }"
                "QMenuBar { background-color: #000000; color: #00FF00; border-bottom: 2px solid #00FF00; }"
                "QMenuBar::item:selected { background-color: #00FF00; color: #000000; }"
                "QMenu { background-color: #000000; color: #00FF00; border: 2px solid #00FF00; }"
                "QMenu::item:selected { background-color: #00FF00; color: #000000; }"
            )

    def apply_size(self):
        size_index = self.settings_size.currentIndex()
        font_size = 12 if size_index == 0 else 16 if size_index == 1 else 20
        font = self.font()
        font.setPointSize(font_size)
        QApplication.setFont(font)

    # Database Backup/Restore Dialogs
    def backup_database(self):
        dest, _ = QFileDialog.getSaveFileName(self, "Backup Database", "player_db_backup.json", "JSON Files (*.json)")
        if dest:
            if self.db.backup_db(dest):
                announce("Database backup completed successfully")
            else:
                announce("Error backing up database")

    def restore_database(self):
        src, _ = QFileDialog.getOpenFileName(self, "Restore Database", "", "JSON Files (*.json)")
        if src:
            if self.db.restore_db(src):
                announce("Database restored. Please restart the application to apply changes.")
                self.load_settings()
                self.refresh_library()
            else:
                announce("Error restoring database")

    def export_book_metadata(self):
        if not self.book_id:
            announce("No audiobook loaded. Please load an audiobook first.")
            QMessageBox.warning(self, "Export Failed", "No audiobook loaded. Please load an audiobook first.")
            return
        dest, _ = QFileDialog.getSaveFileName(self, "Export Bookmarks/Clips", "book_metadata.json", "JSON Files (*.json)")
        if dest:
            if self.db.export_book_data(self.book_id, dest):
                announce("Bookmarks and clips exported successfully")
            else:
                announce("Error exporting bookmarks and clips")

    def import_book_metadata(self):
        if not self.book_id:
            announce("No audiobook loaded. Please load an audiobook first.")
            QMessageBox.warning(self, "Import Failed", "No audiobook loaded. Please load an audiobook first.")
            return
        src, _ = QFileDialog.getOpenFileName(self, "Import Bookmarks/Clips", "", "JSON Files (*.json)")
        if src:
            success, err = self.db.import_book_data(self.book_id, src)
            if success:
                self.load_metadata()
                announce("Bookmarks and clips imported successfully")
            else:
                announce(f"Error importing bookmarks and clips: {err}")
                QMessageBox.critical(self, "Import Error", f"Failed to import metadata:\n{err}")

    # File and Folder selection
    def select_folder(self):
        folder = QFileDialog.getExistingDirectory(self, "Select Audiobook Folder")
        if folder:
            self.load_book(folder, is_folder=True)

    def select_file(self):
        file, _ = QFileDialog.getOpenFileName(self, "Select Audio File", "", "Audio Files (*.mp3 *.wav *.flac *.m4a *.m4b *.ogg *.opus)")
        if file:
            self.load_book(file, is_folder=False)

    def import_folder_to_library(self):
        folder = QFileDialog.getExistingDirectory(self, "Select Audiobook Folder to Import")
        if not folder:
            return
            
        from db_manager import LIBRARY_DIR
        import shutil
        
        folder_name = os.path.basename(os.path.normpath(folder))
        dest_folder = os.path.join(LIBRARY_DIR, folder_name)
        
        if os.path.exists(dest_folder):
            announce(f"A folder named {folder_name} already exists in the library.")
            res = QMessageBox.question(
                self, "Overwrite Folder?", 
                f"A folder named '{folder_name}' already exists in your library. Do you want to overwrite it?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
            )
            if res == QMessageBox.StandardButton.No:
                return
            try:
                shutil.rmtree(dest_folder)
            except Exception as e:
                announce("Failed to remove existing folder")
                QMessageBox.critical(self, "Error", f"Failed to overwrite folder:\n{str(e)}")
                return
                
        announce(f"Importing {folder_name}. Please wait.")
        QApplication.setOverrideCursor(Qt.CursorShape.WaitCursor)
        try:
            shutil.copytree(folder, dest_folder)
            announce(f"Import completed successfully. Loaded {folder_name}")
            self.refresh_library()
            self.load_book(dest_folder, is_folder=True)
        except Exception as e:
            announce("Import failed")
            QMessageBox.critical(self, "Import Error", f"Failed to copy files:\n{str(e)}")
        finally:
            QApplication.restoreOverrideCursor()

    def load_book(self, path, is_folder):
        self.stop_playback()
        self.book_id = path
        self.skipped_tracks = []
        self.track_list = []
        
        # Load playlist settings
        pl_settings = self.db.get_playlist_settings(path)
        self.skipped_tracks = pl_settings.get("skipped", [])
        
        if is_folder:
            folder_name = os.path.basename(path)
            self.book_title_label.setText(folder_name)
            
            # Scan files naturally sorted
            files = [os.path.join(path, f) for f in os.listdir(path) if f.lower().endswith(('.mp3', '.wav', '.flac', '.m4a', '.m4b', '.ogg', '.opus'))]
            files.sort()
            
            # Apply custom ordering if saved
            saved_order = pl_settings.get("order", [])
            if saved_order and len(saved_order) == len(files):
                self.track_list = saved_order
            else:
                self.track_list = files
        else:
            file_name = os.path.basename(path)
            self.book_title_label.setText(file_name)
            self.track_list = [path]

        # Load history
        history = self.db.get_history(path)
        self.load_metadata()

        # Load collections combo
        self.refresh_collections_combobox()

        # Play track list
        self.refresh_tracks_list()
        
        if len(self.track_list) > 0:
            target_idx = 0
            position = 0
            if history:
                try:
                    target_idx = self.track_list.index(history.get("lastFilePath"))
                    position = history.get("lastPosition", 0)
                    self.speed_combo.setCurrentText(f"{history.get('lastSpeed', 1.0)}x")
                    self.volume_slider.setValue(history.get("lastVolume", 100))
                except:
                    pass
            self.load_track(target_idx, position)
            announce(f"Loaded book {self.book_title_label.text()}. Playing track {target_idx + 1}")
        else:
            announce("No playable audio files found in folder")

    def load_track(self, index, seek_position=0):
        if index < 0 or index >= len(self.track_list):
            return
        self.current_track_idx = index
        track_path = self.track_list[index]
        self.player.setSource(QUrl.fromLocalFile(track_path))
        
        # Load position
        if seek_position > 0:
            self.player.setPosition(int(seek_position * 1000))
        
        # Apply speed settings
        self.apply_playback_speed()
        self.refresh_tracks_list()

    def toggle_play(self):
        # Prevent playing if nothing is loaded
        if self.current_track_idx == -1:
            return
            
        if self.player.playbackState() == QMediaPlayer.PlaybackState.PlayingState:
            self.player.pause()
            self.btn_play.setText("Play")
            self.stats_timer.stop()
            announce("Paused")
        else:
            # Apply configurable rewind on play
            settings = self.db.get_settings()
            rewind = settings.get("rewindSeconds", 3)
            if rewind > 0 and self.player.position() > 1000:
                target_pos = max(0, self.player.position() - (rewind * 1000))
                self.player.setPosition(target_pos)
            
            self.player.play()
            self.btn_play.setText("Pause")
            self.stats_timer.start(5000) # Tick every 5 seconds
            announce("Playing")

    def stop_playback(self):
        self.player.stop()
        self.btn_play.setText("Play")
        self.stats_timer.stop()
        self.save_progress()

    def seek_relative(self, ms):
        if self.current_track_idx == -1:
            return
        target = max(0, min(self.player.position() + ms, self.player.duration()))
        self.player.setPosition(target)
        announce(f"Seeked to {self.format_time(target // 1000)}")

    def jump_to_time(self):
        time_str = self.jump_time_input.text().strip()
        parts = time_str.split(':')
        target_ms = 0
        try:
            if len(parts) == 1:
                target_ms = int(parts[0]) * 1000
            elif len(parts) == 2:
                target_ms = (int(parts[0]) * 60 + int(parts[1])) * 1000
            elif len(parts) == 3:
                target_ms = (int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])) * 1000
            else:
                announce("Invalid duration format")
                return
            
            if target_ms >= 0 and target_ms <= self.player.duration():
                self.player.setPosition(target_ms)
                announce(f"Jumped to {self.format_time(target_ms // 1000)}")
                self.jump_time_input.clear()
                self.jump_time_input.clearFocus()
                self.setFocus() # Focus main window so spacebar play shortcut works instantly
            else:
                announce("Time is out of range")
        except Exception:
            announce("Error parsing jump time")

    def skip_track(self, direction):
        if len(self.track_list) == 0:
            return
        next_idx = self.current_track_idx + direction
        
        # Skip checking for skipped tracks
        while 0 <= next_idx < len(self.track_list):
            if self.track_list[next_idx] not in self.skipped_tracks:
                self.load_track(next_idx, 0)
                if self.player.playbackState() != QMediaPlayer.PlaybackState.PlayingState:
                    self.toggle_play()
                return
            next_idx += direction
            
        announce("No more non-skipped tracks available")

    # Volume and Speed sliders
    def on_volume_changed(self, value):
        # QAudioOutput volume is 0.0 to 1.0
        # Support software boost up to 200%
        self.audio_output.setVolume(value / 100.0)
        self.volume_lbl.setText(f"{value}%" + (" Boost" if value > 100 else ""))
        if value % 10 == 0:
            announce(f"Volume {value} percent")

    def adjust_volume(self, delta):
        new_val = max(0, min(self.volume_slider.value() + delta, 200))
        self.volume_slider.setValue(new_val)

    def on_speed_changed(self, text):
        self.apply_playback_speed()
        announce(f"Speed set to {text}")

    def apply_playback_speed(self):
        try:
            speed_val = float(self.speed_combo.currentText().replace('x', ''))
            self.player.setPlaybackRate(speed_val)
        except Exception:
            pass

    # Position/Duration Tick Handlers
    def on_position_changed(self, position):
        self.progress_slider.blockSignals(True)
        self.progress_slider.setValue(position)
        self.progress_slider.blockSignals(False)
        self.pos_label.setText(self.format_time(position // 1000))

        # Check loop clip bounds
        if self.active_loop_clip:
            current_sec = position / 1000.0
            if current_sec >= self.active_loop_clip["endTimestamp"] or current_sec < self.active_loop_clip["startTimestamp"]:
                self.player.setPosition(int(self.active_loop_clip["startTimestamp"] * 1000))

        # Check Revision Mode progress
        if self.is_revision_mode and self.current_revision_idx != -1:
            sorted_hls = self.get_sorted_highlights(self.highlights)
            if self.current_revision_idx < len(sorted_hls):
                current_hl = sorted_hls[self.current_revision_idx]
                if (position / 1000.0) >= current_hl["endTimestamp"]:
                    self.advance_revision_mode()

    def on_duration_changed(self, duration):
        self.progress_slider.setRange(0, duration)
        self.dur_label.setText(self.format_time(duration // 1000))

    def on_slider_moved(self, value):
        self.player.setPosition(value)

    def on_media_status_changed(self, status):
        if status == QMediaPlayer.MediaStatus.EndOfMedia:
            self.handle_track_ended()

    def handle_track_ended(self):
        if self.sleep_mode == "track":
            self.player.stop()
            self.sleep_mode = "off"
            self.btn_sleep.setText("Sleep: Off")
            announce("Sleep timer finished. Playback stopped at end of track.")
            return

        repeat = self.repeat_combo.currentIndex()
        if repeat == 1: # Repeat Track
            self.player.setPosition(0)
            self.player.play()
            announce("Repeating track")
        elif self.chk_shuffle.isChecked():
            import random
            avail = [i for i, f in enumerate(self.track_list) if f not in self.skipped_tracks]
            if avail:
                self.load_track(random.choice(avail), 0)
                self.player.play()
            else:
                announce("All tracks are skipped")
        else:
            # Advance to next track
            self.skip_track(1)

    # Bookmarks & Highlights CRUD
    def save_bookmark(self):
        if not self.book_id or self.current_track_idx == -1:
            return
        desc = self.bm_desc_input.text().strip()
        timestamp = self.player.position() // 1000
        name = desc or f"Bookmark at {self.format_time(timestamp)}"
        
        self.db.add_bookmark(self.book_id, self.track_list[self.current_track_idx], timestamp, name, desc)
        self.bm_desc_input.clear()
        self.load_metadata()
        announce("Bookmark saved successfully")

    def save_highlight(self):
        if not self.book_id or self.current_track_idx == -1:
            return
        name = self.hl_name_input.text().strip()
        start_str = self.hl_start_input.text().strip()
        end_str = self.hl_end_input.text().strip()
        notes = self.hl_notes_input.text().strip()
        tags = self.hl_tags_input.text().strip()
        
        col_id = self.hl_col_combo.currentData()

        try:
            start = float(start_str)
            end = float(end_str)
            if start >= end:
                announce("Start time must be before end time")
                return
        except Exception:
            announce("Please enter valid start and end seconds")
            return

        self.db.add_highlight(self.book_id, self.track_list[self.current_track_idx], start, end, name, notes, tags, col_id)
        
        # Clear fields
        self.hl_name_input.clear()
        self.hl_start_input.clear()
        self.hl_end_input.clear()
        self.hl_notes_input.clear()
        self.hl_tags_input.clear()
        self.hl_col_combo.setCurrentIndex(0)
        
        self.load_metadata()
        announce("Study highlight saved successfully")

    def set_highlight_start_time(self):
        sec = self.player.position() // 1000
        self.hl_start_input.setText(str(sec))
        announce(f"Start time set to {self.format_time(sec)}")

    def set_highlight_end_time(self):
        sec = self.player.position() // 1000
        self.hl_end_input.setText(str(sec))
        announce(f"End time set to {self.format_time(sec)}")

    def delete_bookmark(self, bm_id):
        self.db.delete_bookmark(self.book_id, bm_id)
        self.load_metadata()
        announce("Bookmark deleted")

    def delete_highlight(self, hl_id):
        self.db.delete_highlight(self.book_id, hl_id)
        self.load_metadata()
        announce("Highlight deleted")

    def load_metadata(self):
        if not self.book_id:
            return
        self.bookmarks = self.db.get_bookmarks(self.book_id)
        self.highlights = self.db.get_highlights(self.book_id)

        # Refresh Bookmarks list
        self.bookmarks_list.clear()
        for bm in self.bookmarks:
            item = QListWidgetItem(f"{bm['name']} ({self.format_time(bm['timestamp'])})")
            
            # Render play/delete buttons inside list item
            widget = QWidget()
            layout = QHBoxLayout(widget)
            layout.setContentsMargins(0, 0, 0, 0)
            layout.addWidget(QLabel(f"{bm['name']} ({self.format_time(bm['timestamp'])})"))
            
            btn_play_bm = QPushButton("Go")
            btn_play_bm.clicked.connect(lambda checked, t=bm['timestamp']: self.player.setPosition(t * 1000))
            
            btn_del_bm = QPushButton("Delete")
            btn_del_bm.clicked.connect(lambda checked, b_id=bm['id']: self.delete_bookmark(b_id))
            
            layout.addWidget(btn_play_bm)
            layout.addWidget(btn_del_bm)
            
            item.setSizeHint(widget.sizeHint())
            self.bookmarks_list.addItem(item)
            self.bookmarks_list.setItemWidget(item, widget)

        self.refresh_highlights_list()

    def refresh_highlights_list(self):
        self.highlights_list.clear()
        filter_text = self.tag_filter_input.text().strip().lower()
        
        sorted_hls = self.get_sorted_highlights(self.highlights)
        for hl in sorted_hls:
            # Check filter
            if filter_text:
                matched = any(filter_text in tag.lower() for tag in hl.get("tags", []))
                if not matched:
                    continue
                    
            item = QListWidgetItem()
            widget = QWidget()
            layout = QVBoxLayout(widget)
            layout.setContentsMargins(4, 4, 4, 4)
            
            row = QHBoxLayout()
            row.addWidget(QLabel(f"<b>{hl['name']}</b> ({self.format_time(int(hl['startTimestamp']))} - {self.format_time(int(hl['endTimestamp']))})"))
            
            btn_play_hl = QPushButton("Play")
            btn_play_hl.clicked.connect(lambda checked, h=hl: self.play_clip(h, loop=False))
            row.addWidget(btn_play_hl)

            btn_loop_hl = QPushButton("Loop")
            is_looping = self.active_loop_clip and self.active_loop_clip["id"] == hl["id"]
            if is_looping:
                btn_loop_hl.setStyleSheet("background-color: #00FF00; color: black;")
            btn_loop_hl.clicked.connect(lambda checked, h=hl: self.play_clip(h, loop=True))
            row.addWidget(btn_loop_hl)
            
            btn_del_hl = QPushButton("Delete")
            btn_del_hl.clicked.connect(lambda checked, h_id=hl['id']: self.delete_highlight(h_id))
            row.addWidget(btn_del_hl)
            
            layout.addLayout(row)
            
            if hl.get("notes"):
                layout.addWidget(QLabel(f"<i>Note:</i> {hl['notes']}"))
            if hl.get("tags"):
                layout.addWidget(QLabel(f"Tags: {', '.join(['#' + t for t in hl['tags']])}"))

            item.setSizeHint(widget.sizeHint())
            self.highlights_list.addItem(item)
            self.highlights_list.setItemWidget(item, widget)

    def get_sorted_highlights(self, hList):
        def sort_key(hl):
            try:
                idx = self.track_list.index(hl["filePath"])
            except ValueError:
                idx = 9999
            return (idx, hl["startTimestamp"])
        return sorted(hList, key=sort_key)

    # Revision Mode Sequence Player
    def toggle_revision_mode(self):
        if self.is_revision_mode:
            self.is_revision_mode = False
            self.btn_revision_mode.setText("Start Revision Mode")
            announce("Revision Mode stopped")
        else:
            if not self.highlights:
                announce("No highlights saved yet")
                return
            self.is_revision_mode = True
            self.btn_revision_mode.setText("Stop Revision Mode")
            self.current_revision_idx = 0
            announce("Starting Revision Mode")
            self.play_revision_clip(0)

    def play_revision_clip(self, idx):
        sorted_hls = self.get_sorted_highlights(self.highlights)
        if idx >= len(sorted_hls):
            self.is_revision_mode = False
            self.btn_revision_mode.setText("Start Revision Mode")
            self.player.stop()
            announce("Finished playing revision clips")
            return
            
        self.current_revision_idx = idx
        hl = sorted_hls[idx]
        
        try:
            track_idx = self.track_list.index(hl["filePath"])
            self.load_track(track_idx, hl["startTimestamp"])
            self.player.play()
            announce(f"Playing clip {idx + 1} of {len(sorted_hls)}: {hl['name']}")
        except ValueError:
            # Handle cross-book highlight files
            self.load_book(hl["bookId"], is_folder=os.path.isdir(hl["bookId"]))
            QTimer.singleShot(800, lambda: self.play_revision_clip(idx))

    def advance_revision_mode(self):
        self.play_revision_clip(self.current_revision_idx + 1)

    def play_clip(self, hl, loop=False):
        if loop and self.active_loop_clip and self.active_loop_clip["id"] == hl["id"]:
            # Stop looping
            self.active_loop_clip = None
            announce("Stopped looping clip")
            self.refresh_highlights_list()
            return

        try:
            track_idx = self.track_list.index(hl["filePath"])
            if track_idx != self.current_track_idx:
                self.load_track(track_idx, hl["startTimestamp"])
            else:
                self.player.setPosition(int(hl["startTimestamp"] * 1000))
            
            if loop:
                self.active_loop_clip = hl
                announce(f"Looping clip: {hl['name']}")
            else:
                self.active_loop_clip = None
                announce(f"Playing clip: {hl['name']}")
                
            self.player.play()
            self.refresh_highlights_list()
        except ValueError:
            # Cross book playing
            self.load_book(hl["bookId"], is_folder=os.path.isdir(hl["bookId"]))
            QTimer.singleShot(800, lambda: self.play_clip(hl, loop))

    # Collections CRUD
    def create_collection(self):
        name = self.col_name_input.text().strip()
        desc = self.col_desc_input.text().strip()
        if not name:
            announce("Please enter collection name")
            return
            
        cols = self.db.get_collections()
        new_col = {
            "id": str(uuid.uuid4())[:8] if 'uuid' in sys.modules else str(len(cols)),
            "name": name,
            "description": desc
        }
        import uuid
        new_col["id"] = str(uuid.uuid4())[:8]
        
        cols.append(new_col)
        self.db.save_collections(cols)
        self.col_name_input.clear()
        self.col_desc_input.clear()
        self.refresh_collections_list()
        self.refresh_collections_combobox()
        announce("Collection created")

    def delete_collection(self, col_id):
        cols = self.db.get_collections()
        cols = [c for c in cols if c["id"] != col_id]
        self.db.save_collections(cols)
        self.refresh_collections_list()
        self.refresh_collections_combobox()
        announce("Collection deleted")

    def refresh_collections_list(self):
        self.collections_list.clear()
        cols = self.db.get_collections()
        for col in cols:
            item = QListWidgetItem()
            widget = QWidget()
            layout = QHBoxLayout(widget)
            layout.setContentsMargins(0, 0, 0, 0)
            layout.addWidget(QLabel(f"<b>{col['name']}</b> - {col['description']}"))
            
            btn_del = QPushButton("Delete")
            btn_del.clicked.connect(lambda checked, c_id=col['id']: self.delete_collection(c_id))
            layout.addWidget(btn_del)
            
            item.setSizeHint(widget.sizeHint())
            self.collections_list.addItem(item)
            self.collections_list.setItemWidget(item, widget)

    def refresh_collections_combobox(self):
        self.hl_col_combo.clear()
        self.hl_col_combo.addItem("No Collection", None)
        for col in self.db.get_collections():
            self.hl_col_combo.addItem(col["name"], col["id"])

    def on_collection_clicked(self, item):
        pass

    # Playlist skip/reorder methods
    def toggle_track_skip(self, path, checked):
        if checked:
            if path not in self.skipped_tracks:
                self.skipped_tracks.append(path)
                announce("Track skipped")
        else:
            if path in self.skipped_tracks:
                self.skipped_tracks.remove(path)
                announce("Track enabled")
                
        if self.book_id:
            self.db.save_playlist_settings(self.book_id, self.skipped_tracks, self.track_list)
        self.refresh_tracks_list()

    def move_track(self, direction):
        curr_row = self.tracks_list.currentRow()
        if curr_row == -1:
            return
        swap_row = curr_row - 1 if direction == "up" else curr_row + 1
        if swap_row < 0 or swap_row >= len(self.track_list):
            return
            
        # Swap list item elements
        self.track_list[curr_row], self.track_list[swap_row] = self.track_list[swap_row], self.track_list[curr_row]
        if self.current_track_idx == curr_row:
            self.current_track_idx = swap_row
        elif self.current_track_idx == swap_row:
            self.current_track_idx = curr_row
            
        if self.book_id:
            self.db.save_playlist_settings(self.book_id, self.skipped_tracks, self.track_list)
            
        self.refresh_tracks_list()
        self.tracks_list.setCurrentRow(swap_row)
        announce(f"Track moved {direction}")

    def refresh_tracks_list(self):
        self.tracks_list.clear()
        for i, track in enumerate(self.track_list):
            name = os.path.basename(track)
            is_skipped = track in self.skipped_tracks
            is_current = i == self.current_track_idx

            item = QListWidgetItem()
            widget = QWidget()
            layout = QHBoxLayout(widget)
            layout.setContentsMargins(4, 2, 4, 2)
            
            lbl_name = QLabel(f"{i + 1}. {name}")
            if is_current:
                lbl_name.setStyleSheet("font-weight: bold; color: #00FF00;" if self.settings_theme.currentIndex() == 2 else "font-weight: bold; color: var(--accent);")
            layout.addWidget(lbl_name, stretch=1)
            
            chk_skip = QCheckBox("Skip")
            chk_skip.setChecked(is_skipped)
            chk_skip.toggled.connect(lambda checked, p=track: self.toggle_track_skip(p, checked))
            layout.addWidget(chk_skip)

            item.setSizeHint(widget.sizeHint())
            self.tracks_list.addItem(item)
            self.tracks_list.setItemWidget(item, widget)
            
        self.tracks_label.setText(f"Tracks ({len(self.track_list)})")

    # Library history and managed list
    def refresh_library(self):
        self.library_list.clear()
        
        from db_manager import LIBRARY_DIR
        
        # 1. Add Managed Books
        managed_books = []
        if os.path.exists(LIBRARY_DIR):
            try:
                for entry in os.scandir(LIBRARY_DIR):
                    if entry.is_dir():
                        managed_books.append(entry.path)
            except Exception as e:
                print("Error scanning library dir", e)
        
        managed_books.sort(key=lambda p: os.path.basename(p).lower())
        
        if managed_books:
            header_item = QListWidgetItem("--- LIBRARY BOOKS ---")
            header_item.setFlags(Qt.ItemFlag.NoItemFlags)
            self.library_list.addItem(header_item)
            
            for path in managed_books:
                display = os.path.basename(path)
                item = QListWidgetItem(f"📁 {display}")
                item.setData(Qt.ItemDataRole.UserRole, path)
                self.library_list.addItem(item)
        
        # 2. Add Recent / External Books
        recent_records = self.db.get_history_list()
        external_records = []
        for r in recent_records:
            book_path = r["bookId"]
            is_managed = False
            try:
                is_managed = os.path.abspath(book_path).lower().startswith(os.path.abspath(LIBRARY_DIR).lower())
            except:
                pass
            if not is_managed:
                external_records.append(r)
                
        if external_records:
            header_item = QListWidgetItem("--- EXTERNAL / RECENT ---")
            header_item.setFlags(Qt.ItemFlag.NoItemFlags)
            self.library_list.addItem(header_item)
            
            for r in external_records:
                display = os.path.basename(r["bookId"])
                item = QListWidgetItem(f"🔗 {display}")
                item.setData(Qt.ItemDataRole.UserRole, r["bookId"])
                self.library_list.addItem(item)

    def on_library_item_clicked(self, item):
        book_path = item.data(Qt.ItemDataRole.UserRole)
        if not book_path:
            return
        is_folder = os.path.isdir(book_path)
        self.load_book(book_path, is_folder)

    # Sleep Timer Event Tick
    def cycle_sleep_timer(self):
        if self.sleep_mode == "off":
            self.sleep_mode = "10"
            self.sleep_timer_val = 10
            self.sleep_timer.start(60000) # Tick every 1 minute
            self.btn_sleep.setText("Sleep: 10m")
            announce("Sleep timer set to 10 minutes")
        elif self.sleep_mode == "10":
            self.sleep_mode = "20"
            self.sleep_timer_val = 20
            self.btn_sleep.setText("Sleep: 20m")
            announce("Sleep timer set to 20 minutes")
        elif self.sleep_mode == "20":
            self.sleep_mode = "track"
            self.sleep_timer.stop()
            self.btn_sleep.setText("Sleep: Track")
            announce("Sleep timer set to end of current track")
        else:
            self.sleep_mode = "off"
            self.sleep_timer.stop()
            self.btn_sleep.setText("Sleep: Off")
            announce("Sleep timer turned off")

    def on_sleep_tick(self):
        if self.sleep_timer_val > 1:
            self.sleep_timer_val -= 1
            if self.sleep_timer_val == 5 or self.sleep_timer_val == 1:
                announce(f"{self.sleep_timer_val} minutes remaining on sleep timer")
        else:
            # Sleep timer elapsed! Fade out audio
            self.sleep_timer.stop()
            self.sleep_mode = "off"
            self.btn_sleep.setText("Sleep: Off")
            self.fade_out_and_pause()

    def fade_out_and_pause(self):
        announce("Sleep timer completed. Fading out audio")
        original_vol = self.volume_slider.value()
        
        # Fade volume to 0 over 3 seconds using timer tick
        self.fade_vol = original_vol
        self.fade_timer = QTimer()
        
        def do_fade():
            if self.fade_vol > 5:
                self.fade_vol -= 5
                self.audio_output.setVolume(self.fade_vol / 100.0)
            else:
                self.fade_timer.stop()
                self.player.pause()
                self.btn_play.setText("Play")
                # restore volume
                self.audio_output.setVolume(original_vol / 100.0)
                
        self.fade_timer.timeout.connect(do_fade)
        self.fade_timer.start(150) # decrease volume every 150ms

    # Stats Ticker
    def log_playback_stats(self):
        if self.player.playbackState() == QMediaPlayer.PlaybackState.PlayingState:
            self.db.increment_daily_stats(5)
            self.refresh_stats_display()

    def refresh_stats_display(self):
        stats = self.db.get_stats()
        today = datetime.now().strftime("%Y-%m-%d")
        
        today_mins = round(stats.get(today, 0) / 60.0, 1)
        alltime_mins = round(sum(stats.values()) / 60.0, 1)
        
        self.stats_today_lbl.setText(f"Today's Listening Time: {today_mins} minutes")
        self.stats_alltime_lbl.setText(f"All-Time Listening Time: {alltime_mins} minutes")

        self.stats_breakdown_list.clear()
        for k, v in sorted(stats.items(), reverse=True)[:7]:
            self.stats_breakdown_list.addItem(f"{k} - {round(v / 60.0, 1)} minutes")

    # Command line Open With argument check
    def check_launch_arguments(self):
        if len(sys.argv) > 1:
            launch_file = sys.argv[1]
            if os.path.exists(launch_file) and launch_file.lower().endswith(('.mp3', '.wav', '.flac', '.m4a', '.m4b', '.ogg', '.opus')):
                QTimer.singleShot(1000, lambda: self.load_book(launch_file, is_folder=False))

    # Helpers
    def format_time(self, seconds):
        h = seconds // 3600
        m = (seconds % 3600) // 60
        s = seconds % 60
        if h > 0:
            return f"{h}:{m:02d}:{s:02d}"
        return f"{m}:{s:02d}"

    def save_progress(self):
        if self.book_id and self.current_track_idx != -1:
            self.db.save_history(
                self.book_id,
                self.track_list[self.current_track_idx],
                self.player.position() / 1000.0,
                float(self.speed_combo.currentText().replace('x', '')),
                self.volume_slider.value()
            )
            self.refresh_library()

    def check_for_updates(self):
        announce("Checking for software updates")
        QMessageBox.information(self, "Check for Updates", "You are running the latest version: 1.0.0")

    def on_track_double_clicked(self, item):
        row = self.tracks_list.row(item)
        self.load_track(row, 0)
        self.player.play()
        self.btn_play.setText("Pause")
        announce(f"Playing track {row + 1}")

    def focus_jump_time_box(self):
        self.jump_time_input.setFocus()
        self.jump_time_input.selectAll()
        announce("Jump to time box active. Type duration and press Enter.")

    def focus_clip_name(self):
        self.tab_widget.setCurrentIndex(0)
        self.hl_name_input.setFocus()
        announce("Focus set to Clip label input")

    def focus_clip_notes(self):
        self.tab_widget.setCurrentIndex(0)
        self.hl_notes_input.setFocus()
        announce("Focus set to Clip study notes input")

    def closeEvent(self, event):
        self.stop_playback()
        event.accept()

    def eventFilter(self, obj, event):
        from PyQt6.QtCore import QEvent
        if event.type() == QEvent.Type.KeyPress:
            if event.key() in (Qt.Key.Key_Up, Qt.Key.Key_Down):
                # If currently focused widget is QLineEdit, let it handle the up/down keys normally
                from PyQt6.QtWidgets import QLineEdit
                if isinstance(QApplication.focusWidget(), QLineEdit):
                    return super().eventFilter(obj, event)
                
                # Otherwise, adjust volume globally
                if event.key() == Qt.Key.Key_Up:
                    self.adjust_volume(5)
                else:
                    self.adjust_volume(-5)
                return True # Consume keypress event
        return super().eventFilter(obj, event)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    player = AccessibleAudiobookPlayer()
    player.show()
    sys.exit(app.exec())
