import { PlaybackState, Bookmark, Highlight, BookHistory } from '../shared/types'

export interface IElectronAPI {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  loadFile: (filePath: string) => Promise<void>;
  loadFolder: (folderPath: string) => Promise<{ files: string[], folderName: string } | null>;
  selectFolderDialog: () => Promise<string | null>;
  selectFileDialog: () => Promise<string | null>;
  saveHistory: (history: BookHistory) => Promise<void>;
  getHistory: (bookId: string) => Promise<BookHistory | null>;
  getBookmarks: (bookId: string) => Promise<Bookmark[]>;
  addBookmark: (bookmark: Omit<Bookmark, 'id' | 'createdAt'>) => Promise<Bookmark>;
  deleteBookmark: (id: string) => Promise<void>;
  getHighlights: (bookId: string) => Promise<Highlight[]>;
  addHighlight: (highlight: Omit<Highlight, 'id' | 'createdAt'>) => Promise<Highlight>;
  deleteHighlight: (id: string) => Promise<void>;
  incrementDailyStats: (seconds: number) => Promise<void>;
  getStats: () => Promise<Record<string, number>>;
  onCloseRequest: (callback: () => void) => () => void;
  closeReady: () => void;
  onPlaybackState: (callback: (state: PlaybackState) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
