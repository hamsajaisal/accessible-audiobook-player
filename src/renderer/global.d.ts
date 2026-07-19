import { PlaybackState, Bookmark, Highlight, BookHistory, UserSettings, Collection } from '../shared/types'

export interface IElectronAPI {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  loadFile: (filePath: string) => Promise<{ filePath: string, fileName: string } | null>;
  loadFolder: (folderPath: string) => Promise<{ files: string[], folderName: string } | null>;
  selectFolderDialog: () => Promise<string | null>;
  selectFileDialog: () => Promise<string | null>;
  exportPathDialog: () => Promise<string | null>;
  importPathDialog: () => Promise<string | null>;
  backupPathDialog: () => Promise<string | null>;
  restorePathDialog: () => Promise<string | null>;
  saveHistory: (history: BookHistory) => Promise<void>;
  getHistory: (bookId: string) => Promise<BookHistory | null>;
  getHistoryList: () => Promise<BookHistory[]>;
  getBookmarks: (bookId: string) => Promise<Bookmark[]>;
  addBookmark: (bookmark: Omit<Bookmark, 'id' | 'createdAt'>) => Promise<Bookmark>;
  deleteBookmark: (id: string) => Promise<void>;
  getHighlights: (bookId: string) => Promise<Highlight[]>;
  addHighlight: (highlight: Omit<Highlight, 'id' | 'createdAt'>) => Promise<Highlight>;
  deleteHighlight: (id: string) => Promise<void>;
  incrementDailyStats: (seconds: number) => Promise<void>;
  getStats: () => Promise<Record<string, number>>;
  getSettings: () => Promise<UserSettings>;
  saveSettings: (settings: UserSettings) => Promise<void>;
  getCollections: () => Promise<Collection[]>;
  saveCollections: (collections: Collection[]) => Promise<void>;
  savePlaylistSettings: (bookId: string, skipped: string[], order: string[]) => Promise<void>;
  getPlaylistSettings: (bookId: string) => Promise<{ skipped: string[], order: string[] }>;
  backupDatabase: (path: string) => Promise<void>;
  restoreDatabase: (path: string) => Promise<void>;
  exportBookData: (bookId: string, path: string) => Promise<void>;
  importBookData: (bookId: string, path: string) => Promise<void>;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onUpdateStatus: (callback: (status: string) => void) => () => void;
  onCloseRequest: (callback: () => void) => () => void;
  closeReady: () => void;
  onPlaybackState: (callback: (state: PlaybackState) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
