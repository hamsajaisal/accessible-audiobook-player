import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import path from 'path'
import fs from 'fs'
import { db } from './db'
import { autoUpdater } from 'electron-updater'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.m4b', '.wav', '.flac', '.ogg', '.opus', '.aac'])

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

let mainWindow: BrowserWindow | null = null
let isQuitting = false

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.webContents.send('app-close-request')
    }
  })
}

app.whenReady().then(() => {
  protocol.handle('audio-file', (request) => {
    const filePath = decodeURIComponent(request.url.slice('audio-file://'.length))
    // Normalize path for Windows or Linux
    const normalizedPath = filePath.startsWith('/') ? filePath : '/' + filePath
    return net.fetch('file://' + normalizedPath.replace(/\\/g, '/'))
  })

  createWindow()

  // Setup autoUpdater listeners to relay events to renderer
  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update-status', 'checking')
  })
  autoUpdater.on('update-available', () => {
    mainWindow?.webContents.send('update-status', 'available')
  })
  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update-status', 'not-available')
  })
  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update-status', `error: ${err.message || 'unknown error'}`)
  })
  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update-status', 'downloaded')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Dialog controls
ipcMain.handle('dialog:selectFolder', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
})

ipcMain.handle('dialog:selectFile', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Audio Files', extensions: Array.from(AUDIO_EXTENSIONS).map(ext => ext.slice(1)) }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
})

ipcMain.handle('dialog:exportPath', async () => {
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Audiobook Data',
    defaultPath: 'audiobook-data.json',
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  })
  return result.canceled ? null : result.filePath
})

ipcMain.handle('dialog:importPath', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Audiobook Data',
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  })
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
})

ipcMain.handle('dialog:backupPath', async () => {
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Backup Database',
    defaultPath: 'player-db-backup.json',
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  })
  return result.canceled ? null : result.filePath
})

ipcMain.handle('dialog:restorePath', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Restore Database',
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  })
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
})

// Folder scanning
ipcMain.handle('audio:loadFolder', async (_event, folderPath: string) => {
  try {
    const files = fs.readdirSync(folderPath)
    const audioFiles = files
      .filter(file => AUDIO_EXTENSIONS.has(path.extname(file).toLowerCase()))
      .sort(naturalCompare)
      .map(file => path.join(folderPath, file))

    const folderName = path.basename(folderPath)
    return { files: audioFiles, folderName }
  } catch (error) {
    console.error('Error loading folder', error)
    return null
  }
})

// File loading metadata helper
ipcMain.handle('audio:loadFile', async (_event, filePath: string) => {
  return { filePath, fileName: path.basename(filePath) }
})

// Database mappings
ipcMain.handle('db:saveHistory', (_event, history) => db.saveHistory(history))
ipcMain.handle('db:getHistory', (_event, bookId) => db.getHistory(bookId))
ipcMain.handle('db:getHistoryList', () => db.getHistoryList())
ipcMain.handle('db:getBookmarks', (_event, bookId) => db.getBookmarks(bookId))
ipcMain.handle('db:addBookmark', (_event, bookmark) => db.addBookmark(bookmark))
ipcMain.handle('db:deleteBookmark', (_event, id) => db.deleteBookmark(id))
ipcMain.handle('db:getHighlights', (_event, bookId) => db.getHighlights(bookId))
ipcMain.handle('db:addHighlight', (_event, highlight) => db.addHighlight(highlight))
ipcMain.handle('db:deleteHighlight', (_event, id) => db.deleteHighlight(id))
ipcMain.handle('db:incrementDailyStats', (_event, seconds) => db.incrementDailyStats(seconds))
ipcMain.handle('db:getStats', () => db.getStats())
ipcMain.handle('db:getSettings', () => db.getSettings())
ipcMain.handle('db:saveSettings', (_event, settings) => db.saveSettings(settings))
ipcMain.handle('db:getCollections', () => db.getCollections())
ipcMain.handle('db:saveCollections', (_event, cols) => db.saveCollections(cols))
ipcMain.handle('db:savePlaylistSettings', (_event, bookId, skipped, order) => db.savePlaylistSettings(bookId, skipped, order))
ipcMain.handle('db:getPlaylistSettings', (_event, bookId) => db.getPlaylistSettings(bookId))
ipcMain.handle('db:backupDatabase', (_event, path) => db.backupDatabase(path))
ipcMain.handle('db:restoreDatabase', (_event, path) => db.restoreDatabase(path))
ipcMain.handle('db:exportBookData', (_event, bookId, path) => db.exportBookData(bookId, path))
ipcMain.handle('db:importBookData', (_event, bookId, path) => db.importBookData(bookId, path))

// Auto Updater triggers
ipcMain.handle('app:checkForUpdates', () => autoUpdater.checkForUpdatesAndNotify())
ipcMain.handle('app:installUpdate', () => autoUpdater.quitAndInstall())

ipcMain.on('app-close-ready', () => {
  isQuitting = true
  if (mainWindow) {
    mainWindow.close()
  }
})
