import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { Bookmark, Highlight, BookHistory, UserSettings, Collection } from '../shared/types'

const dbPath = path.join(app.getPath('userData'), 'player-db.json')

interface DatabaseSchema {
  history: Record<string, BookHistory>;
  bookmarks: Record<string, Bookmark[]>;
  highlights: Record<string, Highlight[]>;
  stats: Record<string, number>; // YYYY-MM-DD -> seconds listened
  settings?: UserSettings;
  collections?: Collection[];
  skippedTracks?: Record<string, string[]>;
  trackOrder?: Record<string, string[]>;
}

const defaultSettings: UserSettings = {
  rewindSeconds: 3,
  theme: 'dark',
  buttonSize: 'normal',
  defaultSpeed: 1.0,
  verbosity: 'normal'
}

const defaultData: DatabaseSchema = {
  history: {},
  bookmarks: {},
  highlights: {},
  stats: {},
  settings: defaultSettings,
  collections: [],
  skippedTracks: {},
  trackOrder: {}
}

function readDb(): DatabaseSchema {
  if (!fs.existsSync(dbPath)) {
    return defaultData
  }
  try {
    const data = fs.readFileSync(dbPath, 'utf8')
    const parsed = JSON.parse(data)
    return {
      ...defaultData,
      ...parsed,
      settings: parsed.settings ? { ...defaultSettings, ...parsed.settings } : defaultSettings
    }
  } catch (e) {
    console.error('Error reading database, creating new one', e)
    return defaultData
  }
}

function writeDb(data: DatabaseSchema) {
  try {
    const tempPath = dbPath + '.tmp'
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tempPath, dbPath)
  } catch (e) {
    console.error('Error writing database', e)
  }
}

export const db = {
  saveHistory: (history: BookHistory) => {
    const data = readDb()
    data.history[history.bookId] = history
    writeDb(data)
  },
  getHistory: (bookId: string): BookHistory | null => {
    const data = readDb()
    return data.history[bookId] || null
  },
  getHistoryList: (): BookHistory[] => {
    const data = readDb()
    return Object.values(data.history).sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt))
  },
  getBookmarks: (bookId: string): Bookmark[] => {
    const data = readDb()
    return data.bookmarks[bookId] || []
  },
  addBookmark: (bookmark: Omit<Bookmark, 'id' | 'createdAt'>): Bookmark => {
    const data = readDb()
    const newBookmark: Bookmark = {
      ...bookmark,
      id: Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString()
    }
    if (!data.bookmarks[bookmark.bookId]) {
      data.bookmarks[bookmark.bookId] = []
    }
    data.bookmarks[bookmark.bookId].push(newBookmark)
    writeDb(data)
    return newBookmark
  },
  deleteBookmark: (id: string): void => {
    const data = readDb()
    let changed = false
    for (const bookId in data.bookmarks) {
      const originalLength = data.bookmarks[bookId].length
      data.bookmarks[bookId] = data.bookmarks[bookId].filter(b => b.id !== id)
      if (data.bookmarks[bookId].length !== originalLength) {
        changed = true
      }
    }
    if (changed) writeDb(data)
  },
  getHighlights: (bookId: string): Highlight[] => {
    const data = readDb()
    return data.highlights[bookId] || []
  },
  addHighlight: (highlight: Omit<Highlight, 'id' | 'createdAt'>): Highlight => {
    const data = readDb()
    const newHighlight: Highlight = {
      ...highlight,
      id: Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString()
    }
    if (!data.highlights[highlight.bookId]) {
      data.highlights[highlight.bookId] = []
    }
    data.highlights[highlight.bookId].push(newHighlight)
    writeDb(data)
    return newHighlight
  },
  deleteHighlight: (id: string): void => {
    const data = readDb()
    let changed = false
    for (const bookId in data.highlights) {
      const originalLength = data.highlights[bookId].length
      data.highlights[bookId] = data.highlights[bookId].filter(h => h.id !== id)
      if (data.highlights[bookId].length !== originalLength) {
        changed = true
      }
    }
    if (changed) writeDb(data)
  },
  incrementDailyStats: (seconds: number): void => {
    const data = readDb()
    const today = new Date().toISOString().split('T')[0]
    
    if (!data.stats) {
      data.stats = {}
    }
    
    data.stats[today] = (data.stats[today] || 0) + seconds
    writeDb(data)
  },
  getStats: (): Record<string, number> => {
    const data = readDb()
    return data.stats || {}
  },
  getSettings: (): UserSettings => {
    const data = readDb()
    return data.settings || defaultSettings
  },
  saveSettings: (settings: UserSettings): void => {
    const data = readDb()
    data.settings = settings
    writeDb(data)
  },
  getCollections: (): Collection[] => {
    const data = readDb()
    return data.collections || []
  },
  saveCollections: (collections: Collection[]): void => {
    const data = readDb()
    data.collections = collections
    writeDb(data)
  },
  savePlaylistSettings: (bookId: string, skipped: string[], order: string[]): void => {
    const data = readDb()
    if (!data.skippedTracks) data.skippedTracks = {}
    if (!data.trackOrder) data.trackOrder = {}
    data.skippedTracks[bookId] = skipped
    data.trackOrder[bookId] = order
    writeDb(data)
  },
  getPlaylistSettings: (bookId: string): { skipped: string[], order: string[] } => {
    const data = readDb()
    return {
      skipped: (data.skippedTracks && data.skippedTracks[bookId]) || [],
      order: (data.trackOrder && data.trackOrder[bookId]) || []
    }
  },
  backupDatabase: (destPath: string): void => {
    fs.copyFileSync(dbPath, destPath)
  },
  restoreDatabase: (srcPath: string): void => {
    fs.copyFileSync(srcPath, dbPath)
  },
  exportBookData: (bookId: string, destPath: string): void => {
    const data = readDb()
    const exportPayload = {
      bookId,
      bookmarks: data.bookmarks[bookId] || [],
      highlights: data.highlights[bookId] || []
    }
    fs.writeFileSync(destPath, JSON.stringify(exportPayload, null, 2), 'utf8')
  },
  importBookData: (bookId: string, srcPath: string): void => {
    const raw = fs.readFileSync(srcPath, 'utf8')
    const imported = JSON.parse(raw)
    if (imported && imported.bookId === bookId) {
      const data = readDb()
      data.bookmarks[bookId] = imported.bookmarks || []
      data.highlights[bookId] = imported.highlights || []
      writeDb(data)
    } else {
      throw new Error('Imported data bookId does not match the active audiobook ID')
    }
  }
}
