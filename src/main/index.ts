import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import path from 'path'
import fs from 'fs'
import { db } from './db'

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
ipcMain.handle('db:getBookmarks', (_event, bookId) => db.getBookmarks(bookId))
ipcMain.handle('db:addBookmark', (_event, bookmark) => db.addBookmark(bookmark))
ipcMain.handle('db:deleteBookmark', (_event, id) => db.deleteBookmark(id))
ipcMain.handle('db:getHighlights', (_event, bookId) => db.getHighlights(bookId))
ipcMain.handle('db:addHighlight', (_event, highlight) => db.addHighlight(highlight))
ipcMain.handle('db:deleteHighlight', (_event, id) => db.deleteHighlight(id))
ipcMain.handle('db:incrementDailyStats', (_event, seconds) => db.incrementDailyStats(seconds))
ipcMain.handle('db:getStats', () => db.getStats())

ipcMain.on('app-close-ready', () => {
  isQuitting = true
  if (mainWindow) {
    mainWindow.close()
  }
})
