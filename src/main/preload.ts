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

  // File system dialogs
  selectFolderDialog: () => ipcRenderer.invoke('dialog:selectFolder'),
  selectFileDialog: () => ipcRenderer.invoke('dialog:selectFile'),

  // Storage / DB
  saveHistory: (history: any) => ipcRenderer.invoke('db:saveHistory', history),
  getHistory: (bookId: string) => ipcRenderer.invoke('db:getHistory', bookId),
  getBookmarks: (bookId: string) => ipcRenderer.invoke('db:getBookmarks', bookId),
  addBookmark: (bookmark: any) => ipcRenderer.invoke('db:addBookmark', bookmark),
  deleteBookmark: (id: string) => ipcRenderer.invoke('db:deleteBookmark', id),
  getHighlights: (bookId: string) => ipcRenderer.invoke('db:getHighlights', bookId),
  addHighlight: (highlight: any) => ipcRenderer.invoke('db:addHighlight', highlight),
  deleteHighlight: (id: string) => ipcRenderer.invoke('db:deleteHighlight', id),
  incrementDailyStats: (seconds: number) => ipcRenderer.invoke('db:incrementDailyStats', seconds),
  getStats: () => ipcRenderer.invoke('db:getStats'),

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
