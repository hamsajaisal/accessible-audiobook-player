import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Playback control
  play: () => ipcRenderer.invoke('audio:play'),
  pause: () => ipcRenderer.invoke('audio:pause'),
  stop: () => ipcRenderer.invoke('audio:stop'),
  seek: (seconds: number) => ipcRenderer.invoke('audio:seek', seconds),
  seekTo: (seconds: number) => ipcRenderer.invoke('audio:seekTo', seconds),
  setSpeed: (speed: number) => ipcRenderer.invoke('audio:setSpeed', speed),
  setVolume: (volume: number) => ipcRenderer.invoke('audio:setVolume', volume),
  loadFile: (filePath: string) => ipcRenderer.invoke('audio:loadFile', filePath),
  loadFolder: (folderPath: string) => ipcRenderer.invoke('audio:loadFolder', folderPath),

  // Storage / DB
  saveHistory: (history: any) => ipcRenderer.invoke('db:saveHistory', history),
  getHistory: (bookId: string) => ipcRenderer.invoke('db:getHistory', bookId),
  getHistoryList: () => ipcRenderer.invoke('db:getHistoryList'),
  getBookmarks: (bookId: string) => ipcRenderer.invoke('db:getBookmarks', bookId),
  addBookmark: (bookmark: any) => ipcRenderer.invoke('db:addBookmark', bookmark),
  deleteBookmark: (id: string) => ipcRenderer.invoke('db:deleteBookmark', id),
  getHighlights: (bookId: string) => ipcRenderer.invoke('db:getHighlights', bookId),
  addHighlight: (highlight: any) => ipcRenderer.invoke('db:addHighlight', highlight),
  deleteHighlight: (id: string) => ipcRenderer.invoke('db:deleteHighlight', id),
  incrementDailyStats: (seconds: number) => ipcRenderer.invoke('db:incrementDailyStats', seconds),
  getStats: () => ipcRenderer.invoke('db:getStats'),
  getSettings: () => ipcRenderer.invoke('db:getSettings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('db:saveSettings', settings),
  getCollections: () => ipcRenderer.invoke('db:getCollections'),
  saveCollections: (collections: any) => ipcRenderer.invoke('db:saveCollections', collections),
  savePlaylistSettings: (bookId: string, skipped: string[], order: string[]) => ipcRenderer.invoke('db:savePlaylistSettings', bookId, skipped, order),
  getPlaylistSettings: (bookId: string) => ipcRenderer.invoke('db:getPlaylistSettings', bookId),
  backupDatabase: (path: string) => ipcRenderer.invoke('db:backupDatabase', path),
  restoreDatabase: (path: string) => ipcRenderer.invoke('db:restoreDatabase', path),
  exportBookData: (bookId: string, path: string) => ipcRenderer.invoke('db:exportBookData', bookId, path),
  importBookData: (bookId: string, path: string) => ipcRenderer.invoke('db:importBookData', bookId, path),

  // File system dialogs
  selectFolderDialog: () => ipcRenderer.invoke('dialog:selectFolder'),
  selectFileDialog: () => ipcRenderer.invoke('dialog:selectFile'),
  exportPathDialog: () => ipcRenderer.invoke('dialog:exportPath'),
  importPathDialog: () => ipcRenderer.invoke('dialog:importPath'),
  backupPathDialog: () => ipcRenderer.invoke('dialog:backupPath'),
  restorePathDialog: () => ipcRenderer.invoke('dialog:restorePath'),

  // Auto Updater
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
  onUpdateStatus: (callback: (status: string) => void) => {
    const subscription = (_event: any, status: string) => callback(status)
    ipcRenderer.on('update-status', subscription)
    return () => ipcRenderer.removeListener('update-status', subscription)
  },

  // Close handlers
  onCloseRequest: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on('app-close-request', subscription)
    return () => ipcRenderer.removeListener('app-close-request', subscription)
  },
  closeReady: () => ipcRenderer.send('app-close-ready'),

  // Subscriptions
  onPlaybackState: (callback: (state: any) => void) => {
    const subscription = (_event: any, state: any) => callback(state)
    ipcRenderer.on('playback-state-update', subscription)
    return () => ipcRenderer.removeListener('playback-state-update', subscription)
  }
})
