import { useState, useEffect, useRef } from 'react'
import { Play, Pause, Square, SkipBack, SkipForward, Volume2, VolumeX, Folder, File, Plus, Trash2, Eye, Sun, Moon, Accessibility } from 'lucide-react'
import { Bookmark, Highlight, BookHistory, UserSettings, Collection } from '../shared/types'

export default function App() {
  // App States
  const [theme, setTheme] = useState<'dark' | 'light' | 'high-contrast'>('dark')
  const [fontSize, setFontSize] = useState<number>(16)
  const [bookId, setBookId] = useState<string | null>(null)
  const [bookName, setBookName] = useState<string>('No Audio Loaded')
  const [trackList, setTrackList] = useState<string[]>([])
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1)
  
  // Playback States
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [duration, setDuration] = useState<number>(0)
  const [speed, setSpeed] = useState<number>(1.0)
  const [volume, setVolume] = useState<number>(100) // 0 to 200 (100 is original, >100 is boost)
  const [isMuted, setIsMuted] = useState<boolean>(false)
  const [skipInterval] = useState<number>(10) // default 10 seconds

  // Bookmarks & Highlights
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [newBookmarkName, setNewBookmarkName] = useState<string>('')
  const [newHighlightName, setNewHighlightName] = useState<string>('')
  const [highlightStart, setHighlightStart] = useState<string>('')
  const [highlightEnd, setHighlightEnd] = useState<string>('')
  const [activeLoopClip, setActiveLoopClip] = useState<Highlight | null>(null)
  const [isRevisionMode, setIsRevisionMode] = useState<boolean>(false)
  const [currentRevisionIndex, setCurrentRevisionIndex] = useState<number>(-1)
  const [highlightNotes, setHighlightNotes] = useState<string>('')
  const [highlightTags, setHighlightTags] = useState<string>('')

  // Shuffle, Repeat, Tabs & Stats States
  const [isShuffle, setIsShuffle] = useState<boolean>(false)
  const [repeatMode, setRepeatMode] = useState<'off' | 'track' | 'all'>('off')
  const [stats, setStats] = useState<Record<string, number>>({})
  const [activeTab, setActiveTab] = useState<'media' | 'stats' | 'collections' | 'settings' | 'help'>('media')
  const [jumpTimeInput, setJumpTimeInput] = useState<string>('')

  // New settings and playlist states
  const [recentBooks, setRecentBooks] = useState<BookHistory[]>([])
  const [settings, setSettings] = useState<UserSettings>({ rewindSeconds: 3, theme: 'dark', buttonSize: 'normal', defaultSpeed: 1.0, verbosity: 'normal' })
  const [collections, setCollections] = useState<Collection[]>([])
  const [skippedTracks, setSkippedTracks] = useState<string[]>([])
  const [sleepMode, setSleepMode] = useState<'off' | '10' | '20' | 'track'>('off')
  const [sleepTimer, setSleepTimer] = useState<number | null>(null) // minutes remaining
  const [sleepTimerActive, setSleepTimerActive] = useState<boolean>(false)
  const [tagFilter, setTagFilter] = useState<string>('')
  const [updateStatus, setUpdateStatus] = useState<string>('idle')
  const [newCollectionName, setNewCollectionName] = useState<string>('')
  const [newCollectionDesc, setNewCollectionDesc] = useState<string>('')
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('')

  const sleepIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Screen Reader Accessibility Announcements
  const [srAnnouncement, setSrAnnouncement] = useState<string>('')

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const trackNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const saveHistoryIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Announce to Screen Reader
  const announce = (message: string) => {
    setSrAnnouncement(message)
    // Clear announcement after a delay so it can be re-triggered
    setTimeout(() => setSrAnnouncement(''), 1000)
  }

  // Theme configuration
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size-base', `${fontSize}px`)
  }, [fontSize])

  // Initialize Audio Nodes (only once or on user interaction)
  const initAudioContext = () => {
    if (!audioRef.current) return
    if (audioCtxRef.current) return // Already initialized

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioContextClass()
      const gainNode = ctx.createGain()
      const source = ctx.createMediaElementSource(audioRef.current)

      source.connect(gainNode)
      gainNode.connect(ctx.destination)

      audioCtxRef.current = ctx
      gainNodeRef.current = gainNode
      trackNodeRef.current = source
    } catch (e) {
      console.error('Failed to initialize AudioContext:', e)
    }
  }

  // Effect to apply volume and boost
  useEffect(() => {
    if (!audioRef.current) return
    
    // Normal volume range: 0.0 to 1.0
    // GainNode handles boost beyond 1.0
    if (isMuted) {
      audioRef.current.volume = 0
      if (gainNodeRef.current) gainNodeRef.current.gain.value = 0
    } else {
      const parsedVolume = volume / 100
      if (parsedVolume <= 1.0) {
        audioRef.current.volume = parsedVolume
        if (gainNodeRef.current) gainNodeRef.current.gain.value = 1.0
      } else {
        // Boost Mode
        audioRef.current.volume = 1.0
        if (!gainNodeRef.current) {
          initAudioContext()
        }
        if (gainNodeRef.current) {
          gainNodeRef.current.gain.value = parsedVolume // e.g., 1.5 for 150%
        }
      }
    }
  }, [volume, isMuted])

  // Effect to apply playback rate (speed)
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed
    }
  }, [speed])

  // Save progress history periodically
  const saveProgress = () => {
    if (!bookId || currentTrackIndex === -1 || !audioRef.current) return
    
    const history: BookHistory = {
      bookId,
      lastFilePath: trackList[currentTrackIndex],
      lastPosition: audioRef.current.currentTime,
      lastSpeed: speed,
      lastVolume: volume,
      lastPlayedAt: new Date().toISOString()
    }
    window.electronAPI.saveHistory(history)
  }

  useEffect(() => {
    if (isPlaying) {
      saveHistoryIntervalRef.current = setInterval(() => {
        saveProgress()
        window.electronAPI.incrementDailyStats(5)
      }, 5000)
    } else {
      if (saveHistoryIntervalRef.current) {
        clearInterval(saveHistoryIntervalRef.current)
      }
      saveProgress()
    }
    return () => {
      if (saveHistoryIntervalRef.current) {
        clearInterval(saveHistoryIntervalRef.current)
      }
    }
  }, [isPlaying, currentTrackIndex, bookId, volume, speed])

  useEffect(() => {
    const removeCloseListener = window.electronAPI.onCloseRequest(() => {
      saveProgress()
      window.electronAPI.closeReady()
    })
    return () => removeCloseListener()
  }, [bookId, currentTrackIndex, volume, speed, trackList])

  // Load Settings on start
  const loadSettings = async () => {
    const loadedSettings = await window.electronAPI.getSettings()
    if (loadedSettings) {
      setSettings(loadedSettings)
      setTheme(loadedSettings.theme)
      const sizeMap: Record<'small' | 'normal' | 'large', number> = { small: 14, normal: 16, large: 20 }
      setFontSize(sizeMap[loadedSettings.buttonSize] || 16)
      setSpeed(loadedSettings.defaultSpeed || 1.0)
    }
  }

  useEffect(() => {
    loadSettings()
    window.electronAPI.getHistoryList().then(setRecentBooks)
    window.electronAPI.getCollections().then(setCollections)
  }, [])

  useEffect(() => {
    if (activeTab === 'stats') {
      window.electronAPI.getStats().then(setStats)
    }
  }, [activeTab])

  useEffect(() => {
    const removeListener = window.electronAPI.onUpdateStatus((status) => {
      setUpdateStatus(status)
      if (status === 'checking') {
        announce('Checking for updates...')
      } else if (status === 'available') {
        announce('An update is available and downloading in the background.')
      } else if (status === 'not-available') {
        announce('You are running the latest version.')
      } else if (status === 'downloaded') {
        announce('Update downloaded. Ready to restart and install.')
      } else if (status.startsWith('error')) {
        announce('Error checking for updates.')
      }
    })
    return () => removeListener()
  }, [])

  // Sleep Timer countdown Effect
  useEffect(() => {
    if (sleepTimerActive && sleepTimer !== null) {
      sleepIntervalRef.current = setInterval(() => {
        setSleepTimer(prev => {
          if (prev === null) return null
          if (prev <= 1) {
            clearInterval(sleepIntervalRef.current!)
            setSleepTimerActive(false)
            setSleepMode('off')
            triggerSleepFadeOut()
            return 0
          }
          const nextVal = prev - 1
          if (nextVal === 5 || nextVal === 1) {
            announce(`${nextVal} minutes remaining on sleep timer`)
          }
          return nextVal
        })
      }, 60000)
    }
    return () => {
      if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current)
    }
  }, [sleepTimerActive, sleepTimer])

  const triggerSleepFadeOut = () => {
    if (!audioRef.current) return
    announce('Sleep timer finished. Fading out audio.')
    
    if (gainNodeRef.current && audioCtxRef.current) {
      const currentVolume = gainNodeRef.current.gain.value
      gainNodeRef.current.gain.setValueAtTime(currentVolume, audioCtxRef.current.currentTime)
      gainNodeRef.current.gain.linearRampToValueAtTime(0, audioCtxRef.current.currentTime + 5)
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.pause()
          setIsPlaying(false)
          const volPercentage = isMuted ? 0 : volume / 100
          gainNodeRef.current!.gain.setValueAtTime(volPercentage, audioCtxRef.current!.currentTime)
        }
      }, 5000)
    } else {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }

  const cycleSleepTimer = () => {
    if (sleepMode === 'off') {
      setSleepMode('10')
      setSleepTimer(10)
      setSleepTimerActive(true)
      announce('Sleep timer set to 10 minutes')
    } else if (sleepMode === '10') {
      setSleepMode('20')
      setSleepTimer(20)
      setSleepTimerActive(true)
      announce('Sleep timer set to 20 minutes')
    } else if (sleepMode === '20') {
      setSleepMode('track')
      setSleepTimer(null)
      setSleepTimerActive(false)
      announce('Sleep timer set to end of current track')
    } else {
      setSleepMode('off')
      setSleepTimer(null)
      setSleepTimerActive(false)
      announce('Sleep timer turned off')
    }
  }

  // Load Bookmarks and Highlights
  const loadMetadata = async (id: string) => {
    const loadedBookmarks = await window.electronAPI.getBookmarks(id)
    const loadedHighlights = await window.electronAPI.getHighlights(id)
    setBookmarks(loadedBookmarks)
    setHighlights(loadedHighlights)
  }

  // Load a specific track file
  const loadTrack = (index: number, seekToPosition: number = 0, keepSettings: boolean = false) => {
    if (index < 0 || index >= trackList.length) return
    
    if (!keepSettings) {
      setIsRevisionMode(false)
      setActiveLoopClip(null)
    }
    
    // Initialize AudioContext on first track load
    initAudioContext()
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }

    setCurrentTrackIndex(index)
    setCurrentTime(seekToPosition)
    
    const filePath = trackList[index]
    const streamUrl = `audio-file://${filePath}`
    
    if (audioRef.current) {
      audioRef.current.src = streamUrl
      audioRef.current.load()
      
      // Hook up loadedmetadata to set position and play
      const onMetadataLoaded = () => {
        if (audioRef.current) {
          setDuration(audioRef.current.duration)
          audioRef.current.currentTime = seekToPosition
          audioRef.current.playbackRate = speed
          if (isPlaying) {
            audioRef.current.play().catch(err => console.error('Play error', err))
          }
        }
      }
      audioRef.current.onloadedmetadata = onMetadataLoaded
    }

    const fileName = filePath.substring(filePath.lastIndexOf('\\') + 1)
    announce(`Loading track ${index + 1} of ${trackList.length}: ${fileName}`)
  }

  // File & Folder selection & Book Loader
  const loadBook = async (bookPath: string, isFolder: boolean) => {
    if (isFolder) {
      const result = await window.electronAPI.loadFolder(bookPath)
      if (result && result.files.length > 0) {
        setBookId(bookPath)
        setBookName(result.folderName)
        const filesList = await loadPlaylistSettings(bookPath, result.files)
        const history = await window.electronAPI.getHistory(bookPath)
        await loadMetadata(bookPath)
        
        if (history) {
          const fileIdx = filesList.indexOf(history.lastFilePath)
          const targetIdx = fileIdx !== -1 ? fileIdx : 0
          setSpeed(history.lastSpeed)
          setVolume(history.lastVolume)
          loadTrack(targetIdx, history.lastPosition)
          announce(`Loaded book ${result.folderName}. Resuming track ${targetIdx + 1} at ${formatTime(history.lastPosition)}`)
        } else {
          setSpeed(settings.defaultSpeed)
          loadTrack(0, 0)
          announce(`Loaded book ${result.folderName}. Starting from track 1.`)
        }
      }
    } else {
      const result = await window.electronAPI.loadFile(bookPath)
      if (result) {
        const fileName = bookPath.substring(bookPath.lastIndexOf('\\') + 1)
        setBookId(bookPath)
        setBookName(fileName)
        setTrackList([bookPath])
        setSkippedTracks([])
        const history = await window.electronAPI.getHistory(bookPath)
        await loadMetadata(bookPath)

        if (history) {
          setSpeed(history.lastSpeed)
          setVolume(history.lastVolume)
          loadTrack(0, history.lastPosition)
          announce(`Loaded file ${fileName}. Resuming at ${formatTime(history.lastPosition)}`)
        } else {
          setSpeed(settings.defaultSpeed)
          loadTrack(0, 0)
          announce(`Loaded file ${fileName}`)
        }
      }
    }
    window.electronAPI.getHistoryList().then(setRecentBooks)
  }

  const selectFolder = async () => {
    const folderPath = await window.electronAPI.selectFolderDialog()
    if (folderPath) loadBook(folderPath, true)
  }

  const selectFile = async () => {
    const filePath = await window.electronAPI.selectFileDialog()
    if (filePath) loadBook(filePath, false)
  }

  const loadPlaylistSettings = async (id: string, initialFiles: string[]) => {
    const plSettings = await window.electronAPI.getPlaylistSettings(id)
    if (plSettings) {
      setSkippedTracks(plSettings.skipped || [])
      if (plSettings.order && plSettings.order.length === initialFiles.length) {
        setTrackList(plSettings.order)
        return plSettings.order
      }
    }
    setSkippedTracks([])
    setTrackList(initialFiles)
    return initialFiles
  }

  const toggleTrackSkip = async (filePath: string) => {
    if (!bookId) return
    let updatedSkips = [...skippedTracks]
    if (updatedSkips.includes(filePath)) {
      updatedSkips = updatedSkips.filter(f => f !== filePath)
      announce('Track enabled')
    } else {
      updatedSkips.push(filePath)
      announce('Track skipped')
    }
    setSkippedTracks(updatedSkips)
    await window.electronAPI.savePlaylistSettings(bookId, updatedSkips, trackList)
  }

  const moveTrack = async (index: number, direction: 'up' | 'down') => {
    const newList = [...trackList]
    const swapWith = direction === 'up' ? index - 1 : index + 1
    if (swapWith < 0 || swapWith >= trackList.length) return
    
    const temp = newList[index]
    newList[index] = newList[swapWith]
    newList[swapWith] = temp
    
    setTrackList(newList)
    if (currentTrackIndex === index) {
      setCurrentTrackIndex(swapWith)
    } else if (currentTrackIndex === swapWith) {
      setCurrentTrackIndex(index)
    }
    
    if (bookId) {
      await window.electronAPI.savePlaylistSettings(bookId, skippedTracks, newList)
    }
    announce(`Track moved ${direction}`)
  }

  const updateSetting = async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    const updated = { ...settings, [key]: value }
    setSettings(updated)
    await window.electronAPI.saveSettings(updated)
    if (key === 'theme') {
      setTheme(value as any)
    } else if (key === 'buttonSize') {
      const sizeMap: Record<string, number> = { small: 14, normal: 16, large: 20 }
      setFontSize(sizeMap[value as string] || 16)
    }
    announce(`Setting updated: ${key} set to ${value}`)
  }

  const createCollection = async () => {
    const name = newCollectionName.trim()
    if (!name) return
    const newCol: Collection = {
      id: Math.random().toString(36).substring(2, 9),
      name,
      description: newCollectionDesc.trim()
    }
    const updatedCols = [...collections, newCol]
    setCollections(updatedCols)
    await window.electronAPI.saveCollections(updatedCols)
    setNewCollectionName('')
    setNewCollectionDesc('')
    announce(`Collection created: ${name}`)
  }

  const deleteCollection = async (id: string) => {
    const updatedCols = collections.filter(c => c.id !== id)
    setCollections(updatedCols)
    await window.electronAPI.saveCollections(updatedCols)
    const updatedH = highlights.map(item => item.collectionId === id ? { ...item, collectionId: null } : item)
    setHighlights(updatedH)
    announce('Collection deleted')
  }

  const handleBackupDb = async () => {
    const backupPath = await window.electronAPI.backupPathDialog()
    if (backupPath) {
      await window.electronAPI.backupDatabase(backupPath)
      announce('Database backup completed successfully.')
    }
  }

  const handleRestoreDb = async () => {
    const restorePath = await window.electronAPI.restorePathDialog()
    if (restorePath) {
      await window.electronAPI.restoreDatabase(restorePath)
      announce('Database restored successfully. Please restart the application.')
    }
  }

  const handleExportBook = async () => {
    if (!bookId) return
    const exportPath = await window.electronAPI.exportPathDialog()
    if (exportPath) {
      await window.electronAPI.exportBookData(bookId, exportPath)
      announce('Book metadata exported successfully.')
    }
  }

  const handleImportBook = async () => {
    if (!bookId) return
    const importPath = await window.electronAPI.importPathDialog()
    if (importPath) {
      try {
        await window.electronAPI.importBookData(bookId, importPath)
        loadMetadata(bookId)
        announce('Book metadata imported successfully.')
      } catch (err: any) {
        announce(`Import failed: ${err.message || 'unknown error'}`)
      }
    }
  }

  const handleCheckForUpdates = () => {
    window.electronAPI.checkForUpdates()
  }

  const handleInstallUpdate = () => {
    window.electronAPI.installUpdate()
  }

  const getSortedHighlights = (hList: Highlight[]) => {
    return [...hList].sort((a, b) => {
      const idxA = trackList.indexOf(a.filePath)
      const idxB = trackList.indexOf(b.filePath)
      if (idxA !== idxB) return idxA - idxB
      return a.startTimestamp - b.startTimestamp
    })
  }

  const startRevisionMode = () => {
    if (highlights.length === 0) {
      announce('No highlights saved to play.')
      return
    }

    const sorted = getSortedHighlights(highlights)
    setIsRevisionMode(true)
    setActiveLoopClip(null)
    setCurrentRevisionIndex(0)

    const firstHighlight = sorted[0]
    const trackIdx = trackList.indexOf(firstHighlight.filePath)
    if (trackIdx !== -1) {
      if (trackIdx === currentTrackIndex) {
        if (audioRef.current) {
          audioRef.current.currentTime = firstHighlight.startTimestamp
          setCurrentTime(firstHighlight.startTimestamp)
          if (!isPlaying) {
            audioRef.current.play().then(() => setIsPlaying(true))
          }
        }
      } else {
        loadTrack(trackIdx, firstHighlight.startTimestamp, true)
        setIsPlaying(true)
      }
      announce(`Starting Revision Mode. Playing clip 1 of ${sorted.length}: ${firstHighlight.name}`)
    }
  }

  const playClip = (clip: Highlight, loop: boolean = false) => {
    setIsRevisionMode(false)
    const trackIdx = trackList.indexOf(clip.filePath)
    if (trackIdx !== -1) {
      if (trackIdx !== currentTrackIndex) {
        loadTrack(trackIdx, clip.startTimestamp, true)
      } else {
        if (audioRef.current) {
          audioRef.current.currentTime = clip.startTimestamp
          setCurrentTime(clip.startTimestamp)
        }
      }
      
      if (loop) {
        setActiveLoopClip(clip)
        announce(`Looping clip: ${clip.name}`)
      } else {
        setActiveLoopClip(null)
        announce(`Playing clip: ${clip.name}`)
      }

      if (audioRef.current && !isPlaying) {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(err => console.error(err))
      }
    } else {
      // Cross-book clip play! Load the book folder/file first
      const isFolder = clip.bookId.includes('\\') || clip.bookId.includes('/')
      loadBook(clip.bookId, isFolder).then(() => {
        setTimeout(() => {
          playClip(clip, loop)
        }, 800)
      })
    }
  }

  const parseTimeToSeconds = (input: string): number | null => {
    const parts = input.trim().split(':')
    if (parts.length === 1) {
      const secs = parseFloat(parts[0])
      return isNaN(secs) ? null : secs
    } else if (parts.length === 2) {
      const mins = parseInt(parts[0], 10)
      const secs = parseFloat(parts[1])
      if (isNaN(mins) || isNaN(secs)) return null
      return mins * 60 + secs
    } else if (parts.length === 3) {
      const hrs = parseInt(parts[0], 10)
      const mins = parseInt(parts[1], 10)
      const secs = parseFloat(parts[2])
      if (isNaN(hrs) || isNaN(mins) || isNaN(secs)) return null
      return hrs * 3600 + mins * 60 + secs
    }
    return null
  }

  const handleJumpToTime = () => {
    const targetSeconds = parseTimeToSeconds(jumpTimeInput)
    if (targetSeconds === null || targetSeconds < 0 || targetSeconds > duration) {
      announce('Invalid time format. Use seconds or format like MM:SS or HH:MM:SS')
      return
    }
    if (audioRef.current) {
      audioRef.current.currentTime = targetSeconds
      setCurrentTime(targetSeconds)
      announce(`Jumped to ${formatTime(targetSeconds)}`)
      setJumpTimeInput('')
    }
  }

  // Playback Control Triggers
  const handlePlayPause = () => {
    if (!audioRef.current || currentTrackIndex === -1) return
    initAudioContext()

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
      announce('Paused')
    } else {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume()
      }

      // Auto-rewind on Play!
      if (audioRef.current && settings.rewindSeconds > 0 && currentTime > 0) {
        const targetTime = Math.max(0, audioRef.current.currentTime - settings.rewindSeconds)
        audioRef.current.currentTime = targetTime
        setCurrentTime(targetTime)
        if (settings.verbosity === 'verbose') {
          announce(`Rewound ${settings.rewindSeconds} seconds`)
        }
      }

      audioRef.current.play().then(() => {
        setIsPlaying(true)
        if (settings.verbosity === 'verbose') {
          announce('Playing')
        }
      }).catch(err => {
        console.error(err)
        announce('Playback error')
      })
    }
  }

  const handleStop = () => {
    if (!audioRef.current) return
    audioRef.current.pause()
    audioRef.current.currentTime = 0
    setIsPlaying(false)
    saveProgress()
    announce('Stopped')
  }

  const handleSeek = (direction: 'forward' | 'backward') => {
    if (!audioRef.current) return
    const delta = direction === 'forward' ? skipInterval : -skipInterval
    let target = audioRef.current.currentTime + delta
    if (target < 0) target = 0
    if (target > duration) target = duration
    
    audioRef.current.currentTime = target
    setCurrentTime(target)
    announce(`Seeked ${direction === 'forward' ? 'forward' : 'backward'} ${skipInterval} seconds. Position: ${formatTime(target)}`)
  }

  const handleTrackChange = (direction: 'next' | 'prev') => {
    if (trackList.length === 0) return
    const delta = direction === 'next' ? 1 : -1
    let nextIndex = currentTrackIndex + delta
    
    while (nextIndex >= 0 && nextIndex < trackList.length) {
      if (!skippedTracks.includes(trackList[nextIndex])) {
        loadTrack(nextIndex, 0)
        return
      }
      nextIndex += delta
    }
    announce(`No ${direction === 'next' ? 'next' : 'previous'} non-skipped tracks available.`)
  }

  // Track playback ticks
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      const time = audio.currentTime
      setCurrentTime(time)

      // Loop clip
      if (activeLoopClip) {
        if (time >= activeLoopClip.endTimestamp || time < activeLoopClip.startTimestamp) {
          audio.currentTime = activeLoopClip.startTimestamp
          setCurrentTime(activeLoopClip.startTimestamp)
        }
      }

      // Revision mode
      if (isRevisionMode && currentRevisionIndex !== -1 && currentRevisionIndex < highlights.length) {
        const sorted = getSortedHighlights(highlights)
        const currentHighlight = sorted[currentRevisionIndex]
        if (time >= currentHighlight.endTimestamp) {
          const nextIndex = currentRevisionIndex + 1
          if (nextIndex < sorted.length) {
            const nextHighlight = sorted[nextIndex]
            setCurrentRevisionIndex(nextIndex)
            const trackIdx = trackList.indexOf(nextHighlight.filePath)
            if (trackIdx !== -1) {
              if (trackIdx === currentTrackIndex) {
                audio.currentTime = nextHighlight.startTimestamp
                setCurrentTime(nextHighlight.startTimestamp)
                announce(`Playing next clip: ${nextHighlight.name}`)
              } else {
                loadTrack(trackIdx, nextHighlight.startTimestamp, true)
                announce(`Loading track for next clip: ${nextHighlight.name}`)
              }
            }
          } else {
            setIsRevisionMode(false)
            audio.pause()
            setIsPlaying(false)
            announce('End of revision clips reached.')
          }
        }
      }
    }

    const playNextTrack = (currentIndex: number) => {
      let nextIndex = currentIndex + 1
      while (nextIndex < trackList.length) {
        if (!skippedTracks.includes(trackList[nextIndex])) {
          loadTrack(nextIndex, 0)
          return
        }
        nextIndex++
      }
      if (repeatMode === 'all') {
        let firstIndex = 0
        while (firstIndex < trackList.length) {
          if (!skippedTracks.includes(trackList[firstIndex])) {
            loadTrack(firstIndex, 0)
            announce('Folder end reached. Repeating folder.')
            return
          }
          firstIndex++
        }
      }
      setIsPlaying(false)
      announce('End of media reached.')
    }

    const handleEnded = () => {
      if (sleepMode === 'track') {
        setIsPlaying(false)
        setSleepMode('off')
        announce('Sleep timer finished. Playback stopped at end of track.')
        return
      }

      if (!isRevisionMode && !activeLoopClip) {
        if (repeatMode === 'track') {
          if (audioRef.current) {
            audioRef.current.currentTime = 0
            audioRef.current.play().catch(err => console.error(err))
            announce('Repeating current track')
          }
        } else if (isShuffle) {
          const availableIndices = trackList
            .map((track, idx) => ({ track, idx }))
            .filter(item => !skippedTracks.includes(item.track))
          if (availableIndices.length > 0) {
            const randomIndex = Math.floor(Math.random() * availableIndices.length)
            loadTrack(availableIndices[randomIndex].idx, 0)
          } else {
            setIsPlaying(false)
            announce('All tracks are skipped.')
          }
        } else {
          playNextTrack(currentTrackIndex)
        }
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [currentTrackIndex, trackList, activeLoopClip, isRevisionMode, currentRevisionIndex, highlights, repeatMode, isShuffle, skippedTracks, sleepMode])

  // Bookmarks management
  const addBookmark = async () => {
    if (!bookId || currentTrackIndex === -1) return
    const name = newBookmarkName.trim() || `Bookmark at ${formatTime(currentTime)}`
    
    const newB = await window.electronAPI.addBookmark({
      bookId,
      filePath: trackList[currentTrackIndex],
      timestamp: currentTime,
      name,
      description: ''
    })

    setBookmarks([...bookmarks, newB])
    setNewBookmarkName('')
    announce(`Bookmark added: ${name}`)
  }

  const deleteBookmark = async (id: string, name: string) => {
    await window.electronAPI.deleteBookmark(id)
    setBookmarks(bookmarks.filter(b => b.id !== id))
    announce(`Bookmark deleted: ${name}`)
  }

  // Highlights management
  const addHighlight = async () => {
    if (!bookId || currentTrackIndex === -1) return
    const name = newHighlightName.trim() || `Highlight at ${formatTime(currentTime)}`
    
    const startVal = parseFloat(highlightStart)
    const endVal = parseFloat(highlightEnd)

    if (isNaN(startVal) || isNaN(endVal) || startVal >= endVal) {
      announce('Invalid highlight range. Start time must be less than End time.')
      return
    }

    const newH = await window.electronAPI.addHighlight({
      bookId,
      filePath: trackList[currentTrackIndex],
      startTimestamp: startVal,
      endTimestamp: endVal,
      name,
      notes: highlightNotes,
      tags: highlightTags.split(',').map(t => t.trim()).filter(Boolean),
      collectionId: null
    })

    setHighlights([...highlights, newH])
    setNewHighlightName('')
    setHighlightStart('')
    setHighlightEnd('')
    setHighlightNotes('')
    setHighlightTags('')
    announce(`Highlight added: ${name}`)
  }

  const deleteHighlight = async (id: string, name: string) => {
    await window.electronAPI.deleteHighlight(id)
    setHighlights(highlights.filter(h => h.id !== id))
    announce(`Highlight deleted: ${name}`)
  }

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInputFocused = document.activeElement?.tagName === 'INPUT' && (document.activeElement as HTMLInputElement).type === 'text'
      
      // If user is focusing an input field, only allow Control key combinations to pass through
      if (isInputFocused && !e.ctrlKey) {
        return
      }

      // Check Control keys first
      if (e.ctrlKey) {
        if (e.code === 'KeyH') {
          e.preventDefault()
          setActiveTab('media')
          announce('Viewing highlights tab')
          const clipInput = document.querySelector('input[placeholder="Clip label (e.g. Definition of velocity)"]') as HTMLInputElement
          if (clipInput) clipInput.focus()
        } else if (e.code === 'KeyD') {
          e.preventDefault()
          setActiveTab('media')
          addBookmark()
          const bookmarkInput = document.querySelector('input[placeholder="Bookmark description"]') as HTMLInputElement
          if (bookmarkInput) bookmarkInput.focus()
        } else if (e.code === 'KeyN') {
          e.preventDefault()
          setActiveTab('media')
          const notesInput = document.querySelector('input[placeholder="Attach study notes"]') as HTMLInputElement
          if (notesInput) {
            notesInput.focus()
            notesInput.select()
            announce('Type notes for clip')
          }
        } else if (e.code === 'KeyT') {
          e.preventDefault()
          cycleSleepTimer()
        }
        return
      }

      // Standard non-control keys
      if (e.code === 'Space') {
        e.preventDefault()
        handlePlayPause()
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        handleSeek('forward')
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        handleSeek('backward')
      } else if (e.code === 'ArrowUp') {
        e.preventDefault()
        setVolume(prev => Math.min(prev + 5, 200))
        announce(`Volume increased to ${Math.min(volume + 5, 200)}%`)
      } else if (e.code === 'ArrowDown') {
        e.preventDefault()
        setVolume(prev => Math.max(prev - 5, 0))
        announce(`Volume decreased to ${Math.max(volume - 5, 0)}%`)
      } else if (e.code === 'PageUp') {
        e.preventDefault()
        handleTrackChange('prev')
      } else if (e.code === 'PageDown') {
        e.preventDefault()
        handleTrackChange('next')
      } else if (e.code === 'Slash') {
        e.preventDefault()
        const inputEl = document.querySelector('input[placeholder="Go to e.g. 13:25"]') as HTMLInputElement
        if (inputEl) {
          inputEl.focus()
          inputEl.select()
          announce('Jump to time active. Type duration and press Enter.')
        }
      } else if (e.code === 'BracketLeft') {
        e.preventDefault()
        setHighlightStart(Math.floor(currentTime).toString())
        announce(`Start time set to ${formatTime(currentTime)}`)
      } else if (e.code === 'BracketRight') {
        e.preventDefault()
        setHighlightEnd(Math.floor(currentTime).toString())
        announce(`End time set to ${formatTime(currentTime)}`)
      } else if (e.code === 'Minus') {
        e.preventDefault()
        const nextSpeed = Math.max(0.5, Math.round((speed - 0.1) * 10) / 10)
        setSpeed(nextSpeed)
        announce(`Speed decreased to ${nextSpeed}x`)
      } else if (e.code === 'Equal') {
        e.preventDefault()
        const nextSpeed = Math.min(3.0, Math.round((speed + 0.1) * 10) / 10)
        setSpeed(nextSpeed)
        announce(`Speed increased to ${nextSpeed}x`)
      } else if (e.code === 'Home') {
        e.preventDefault()
        if (audioRef.current) {
          audioRef.current.currentTime = 0
          setCurrentTime(0)
          announce('Jumped to start of track')
        }
      } else if (e.code === 'End') {
        e.preventDefault()
        if (audioRef.current && duration) {
          const target = Math.max(0, duration - 1)
          audioRef.current.currentTime = target
          setCurrentTime(target)
          announce('Jumped to end of track')
        }
      } else if (e.code === 'KeyB') {
        e.preventDefault()
        addBookmark()
      } else if (e.code === 'KeyS') {
        e.preventDefault()
        const speeds = [0.5, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0]
        const currentIndex = speeds.indexOf(speed)
        const nextSpeed = speeds[(currentIndex + 1) % speeds.length]
        setSpeed(nextSpeed)
        announce(`Speed changed to ${nextSpeed}x`)
      } else if (e.code === 'KeyR') {
        e.preventDefault()
        const nextMode = repeatMode === 'off' ? 'track' : repeatMode === 'track' ? 'all' : 'off'
        setRepeatMode(nextMode)
        announce(`Repeat mode set to ${nextMode === 'off' ? 'repeat off' : nextMode === 'track' ? 'repeat single track' : 'repeat all tracks'}`)
      } else if (e.code === 'KeyH') {
        e.preventDefault()
        setIsShuffle(prev => {
          const next = !prev
          announce(next ? 'Shuffle play active' : 'Shuffle play inactive')
          return next
        })
      } else if (e.code === 'KeyT') {
        e.preventDefault()
        setActiveTab(prev => {
          const next = prev === 'media' ? 'stats' : 'media'
          announce(`Switched to ${next === 'media' ? 'Clips and Bookmarks' : 'Statistics'} tab`)
          return next
        })
      } else if (e.code === 'KeyL') {
        e.preventDefault()
        setHighlightStart(Math.floor(currentTime).toString())
        announce(`Start time set to ${formatTime(currentTime)}`)
      } else if (e.code === 'KeyK') {
        e.preventDefault()
        setHighlightEnd(Math.floor(currentTime).toString())
        announce(`End time set to ${formatTime(currentTime)}`)
      } else if (e.code === 'KeyN') {
        e.preventDefault()
        const inputEl = document.querySelector('input[placeholder="Bookmark description"]') as HTMLInputElement
        if (inputEl) inputEl.focus()
      } else {
        // Percent jumps (1-9, 0)
        const digitMatch = e.code.match(/^Digit([0-9])$/)
        if (digitMatch) {
          e.preventDefault()
          const num = parseInt(digitMatch[1], 10)
          const percent = num === 0 ? 1.0 : num / 10.0
          const targetTime = duration * percent
          if (audioRef.current && !isNaN(targetTime)) {
            audioRef.current.currentTime = targetTime
            setCurrentTime(targetTime)
            announce(`Jumped to ${num === 0 ? '100%' : `${num * 10}%`} of the track`)
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, currentTrackIndex, trackList, volume, currentTime, skipInterval, speed, repeatMode, duration])


  // Helpers
  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const getAriaProgressText = () => {
    return `${formatTime(currentTime)} of ${formatTime(duration)} played`
  }

  return (
    <div className="app-container">
      {/* Screen Reader Announcement element */}
      <div aria-live="assertive" aria-atomic="true" className="sr-only" style={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: '0',
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        border: '0'
      }}>
        {srAnnouncement}
      </div>

      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* Header */}
      <header className="header" role="banner">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Accessibility aria-hidden="true" />
          <span>Accessible Audio Player</span>
        </h1>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {/* Theme Selector */}
          <div aria-label="Theme selector" role="group" style={{ display: 'flex', gap: '0.25rem' }}>
            <button className="btn" onClick={() => { setTheme('dark'); announce('Theme set to dark mode'); }} title="Dark Mode" aria-label="Dark Mode">
              <Moon size={18} />
            </button>
            <button className="btn" onClick={() => { setTheme('light'); announce('Theme set to light mode'); }} title="Light Mode" aria-label="Light Mode">
              <Sun size={18} />
            </button>
            <button className="btn" onClick={() => { setTheme('high-contrast'); announce('Theme set to high contrast mode'); }} title="High Contrast Mode" aria-label="High Contrast Mode">
              Contrast
            </button>
          </div>

          {/* Font Resizing */}
          <div aria-label="Font size selector" role="group" style={{ display: 'flex', gap: '0.25rem' }}>
            <button className="btn" onClick={() => { setFontSize(prev => Math.max(prev - 2, 12)); announce(`Font size decreased to ${fontSize - 2} pixels`); }} aria-label="Decrease Font Size">A-</button>
            <button className="btn" onClick={() => { setFontSize(prev => Math.min(prev + 2, 24)); announce(`Font size increased to ${fontSize + 2} pixels`); }} aria-label="Increase Font Size">A+</button>
          </div>

          {/* Open Audio controls */}
          <button className="btn btn-primary" onClick={selectFolder} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Folder size={18} aria-hidden="true" />
            <span>Open Folder</span>
          </button>
          <button className="btn" onClick={selectFile} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <File size={18} aria-hidden="true" />
            <span>Open File</span>
          </button>
        </div>
      </header>

      {/* Main Panel */}
      <main id="main-content" className="main-content" role="main">
        {/* Sidebar: Track List */}
        <section className="sidebar" aria-label="Track list">
          <h2>Tracks ({trackList.length})</h2>
          {trackList.length === 0 ? (
            <div>
              <p style={{ color: 'var(--text-muted)' }}>No media loaded</p>
              {recentBooks.length > 0 && (
                <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                  <h3>Library / Recent Books</h3>
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: 0 }}>
                    {recentBooks.map(item => {
                      const displayName = item.bookId.substring(item.bookId.lastIndexOf('\\') + 1)
                      const isFolder = item.bookId.includes('\\') || item.bookId.includes('/')
                      return (
                        <li key={item.bookId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                          <button 
                            className="btn-link" 
                            onClick={() => loadBook(item.bookId, isFolder)}
                            style={{ textAlign: 'left', flex: 1, textDecoration: 'none', color: 'var(--accent)', cursor: 'pointer', background: 'none', border: 'none', padding: '0', fontWeight: '500' }}
                          >
                            {displayName}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <ul role="listbox" aria-label="Tracks in this audiobook" style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: 0 }}>
              {trackList.map((track, index) => {
                const name = track.substring(track.lastIndexOf('\\') + 1)
                const isCurrent = index === currentTrackIndex
                const isSkipped = skippedTracks.includes(track)
                return (
                  <li 
                    key={track}
                    role="option"
                    aria-selected={isCurrent}
                    tabIndex={0}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: isCurrent ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: isCurrent ? 'var(--accent-glow)' : 'transparent',
                      fontWeight: isCurrent ? '600' : 'normal',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      opacity: isSkipped ? 0.5 : 1
                    }}
                  >
                    <div 
                      onClick={() => loadTrack(index, 0)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          loadTrack(index, 0)
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Play track ${index + 1}: ${name}`}
                      style={{ flex: 1, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {index + 1}. {name}
                    </div>
                    
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={isSkipped} 
                        onChange={() => toggleTrackSkip(track)}
                        aria-label={`Skip track ${index + 1}`}
                        title="Skip track on auto-advance"
                      />
                      <button 
                        className="btn" 
                        onClick={(e) => { e.stopPropagation(); moveTrack(index, 'up'); }}
                        disabled={index === 0}
                        aria-label={`Move track ${index + 1} up`}
                        title="Move Up"
                        style={{ padding: '0.1rem 0.3rem', fontSize: '0.75rem' }}
                      >
                        ▲
                      </button>
                      <button 
                        className="btn" 
                        onClick={(e) => { e.stopPropagation(); moveTrack(index, 'down'); }}
                        disabled={index === trackList.length - 1}
                        aria-label={`Move track ${index + 1} down`}
                        title="Move Down"
                        style={{ padding: '0.1rem 0.3rem', fontSize: '0.75rem' }}
                      >
                        ▼
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Content Panel: Bookmarks & Highlights */}
        <section className="content-pane" aria-label="Bookmarks and highlights management">
          <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>{bookName}</h2>
              <div role="tablist" aria-label="Sections" style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                <button 
                  role="tab" 
                  aria-selected={activeTab === 'media'} 
                  className={`btn ${activeTab === 'media' ? 'btn-primary' : ''}`}
                  onClick={() => { setActiveTab('media'); announce('Viewing study clips and bookmarks tab'); }}
                >
                  Clips
                </button>
                <button 
                  role="tab" 
                  aria-selected={activeTab === 'collections'} 
                  className={`btn ${activeTab === 'collections' ? 'btn-primary' : ''}`}
                  onClick={() => { setActiveTab('collections'); announce('Viewing collections tab'); }}
                >
                  Collections
                </button>
                <button 
                  role="tab" 
                  aria-selected={activeTab === 'stats'} 
                  className={`btn ${activeTab === 'stats' ? 'btn-primary' : ''}`}
                  onClick={() => { setActiveTab('stats'); announce('Viewing listening stats tab'); }}
                >
                  Statistics
                </button>
                <button 
                  role="tab" 
                  aria-selected={activeTab === 'settings'} 
                  className={`btn ${activeTab === 'settings' ? 'btn-primary' : ''}`}
                  onClick={() => { setActiveTab('settings'); announce('Viewing settings tab'); }}
                >
                  Settings
                </button>
                <button 
                  role="tab" 
                  aria-selected={activeTab === 'help'} 
                  className={`btn ${activeTab === 'help' ? 'btn-primary' : ''}`}
                  onClick={() => { setActiveTab('help'); announce('Viewing help guide tab'); }}
                >
                  Help
                </button>
              </div>
            </div>

            {activeTab === 'media' ? (
              <>
                {/* Bookmarks Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h3>Bookmarks</h3>
                  
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      className="input" 
                      value={newBookmarkName}
                      onChange={(e) => setNewBookmarkName(e.target.value)}
                      placeholder="Bookmark description" 
                      aria-label="New bookmark name"
                      style={{ flex: 1 }}
                    />
                    <button className="btn btn-primary" onClick={addBookmark}>
                      <Plus size={18} aria-hidden="true" />
                      <span>Save Bookmark</span>
                    </button>
                  </div>

                  {bookmarks.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }}>No bookmarks saved yet</p>
                  ) : (
                    <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
                      {bookmarks.map((b) => (
                        <li key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: 'rgba(0,0,0,0.1)', borderRadius: '6px' }}>
                          <span>{b.name} ({formatTime(b.timestamp)})</span>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn" onClick={() => { if (audioRef.current) audioRef.current.currentTime = b.timestamp; announce(`Jumped to bookmark: ${b.name}`); }} aria-label={`Jump to bookmark ${b.name}`}>
                              <Eye size={16} aria-hidden="true" />
                            </button>
                            <button className="btn" onClick={() => deleteBookmark(b.id, b.name)} aria-label={`Delete bookmark ${b.name}`}>
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Highlights Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Highlights (Study Clips)</h3>
                    {highlights.length > 0 && (
                      <button 
                        className={`btn ${isRevisionMode ? 'btn-primary' : ''}`} 
                        onClick={() => {
                          if (isRevisionMode) {
                            setIsRevisionMode(false)
                            announce('Revision Mode stopped.')
                          } else {
                            startRevisionMode()
                          }
                        }}
                      >
                        {isRevisionMode ? 'Stop Revision Mode' : 'Start Revision Mode'}
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input 
                      type="text" 
                      className="input" 
                      value={newHighlightName}
                      onChange={(e) => setNewHighlightName(e.target.value)}
                      placeholder="Clip label (e.g. Definition of velocity)" 
                      aria-label="Clip label"
                      style={{ flex: '1 1 100%' }}
                    />
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flex: 1 }}>
                      <input 
                        type="text" 
                        className="input"
                        value={highlightStart}
                        onChange={(e) => setHighlightStart(e.target.value)}
                        placeholder="Start (seconds)" 
                        aria-label="Highlight start time in seconds"
                        style={{ flex: 1 }}
                      />
                      <button className="btn" onClick={() => { setHighlightStart(Math.floor(currentTime).toString()); announce(`Start time set to ${formatTime(currentTime)}`); }} aria-label="Use current playback time for start time">Set Start</button>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flex: 1 }}>
                      <input 
                        type="text" 
                        className="input"
                        value={highlightEnd}
                        onChange={(e) => setHighlightEnd(e.target.value)}
                        placeholder="End (seconds)" 
                        aria-label="Highlight end time in seconds"
                        style={{ flex: 1 }}
                      />
                      <button className="btn" onClick={() => { setHighlightEnd(Math.floor(currentTime).toString()); announce(`End time set to ${formatTime(currentTime)}`); }} aria-label="Use current playback time for end time">Set End</button>
                    </div>
                    <input 
                      type="text" 
                      className="input" 
                      value={highlightNotes}
                      onChange={(e) => setHighlightNotes(e.target.value)}
                      placeholder="Attach study notes" 
                      aria-label="Study notes for this clip"
                      style={{ flex: '1 1 100%' }}
                    />
                    <input 
                      type="text" 
                      className="input" 
                      value={highlightTags}
                      onChange={(e) => setHighlightTags(e.target.value)}
                      placeholder="Tags (comma-separated, e.g. Exam, Quote)" 
                      aria-label="Tags for this clip"
                      style={{ flex: '1 1 calc(100% - 160px)' }}
                    />
                    {collections.length > 0 && (
                      <select 
                        className="input" 
                        value={selectedCollectionId} 
                        onChange={(e) => setSelectedCollectionId(e.target.value)}
                        aria-label="Select collection for highlight"
                        style={{ flex: '1 1 100%' }}
                      >
                        <option value="">No Collection</option>
                        {collections.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                    <button className="btn btn-primary" onClick={addHighlight} style={{ width: '150px' }}>
                      <Plus size={18} aria-hidden="true" />
                      <span>Save Highlight</span>
                    </button>
                  </div>

                  {highlights.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                      <label htmlFor="tag-filter">Filter clips by tag:</label>
                      <input 
                        id="tag-filter"
                        type="text" 
                        className="input" 
                        value={tagFilter} 
                        onChange={(e) => setTagFilter(e.target.value)}
                        placeholder="Tag name"
                        style={{ flex: 1 }}
                      />
                    </div>
                  )}

                  {highlights.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }}>No highlights saved yet</p>
                  ) : (
                    <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
                      {getSortedHighlights(highlights).filter(h => {
                        if (!tagFilter) return true
                        return h.tags.some(t => t.toLowerCase().includes(tagFilter.toLowerCase()))
                      }).map((h) => {
                        const isCurrentlyLooping = activeLoopClip?.id === h.id
                        return (
                          <li key={h.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', background: 'rgba(0,0,0,0.1)', borderRadius: '6px', border: isCurrentlyLooping ? '1.5px solid var(--accent)' : 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: '500' }}>{h.name}</span>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn" onClick={() => playClip(h, false)} aria-label={`Play clip ${h.name}`}>
                                  <Eye size={16} aria-hidden="true" />
                                </button>
                                <button className={`btn ${isCurrentlyLooping ? 'btn-primary' : ''}`} onClick={() => playClip(h, !isCurrentlyLooping)} aria-label={`${isCurrentlyLooping ? 'Stop looping' : 'Loop'} clip ${h.name}`}>
                                  Loop
                                </button>
                                <button className="btn" onClick={() => deleteHighlight(h.id, h.name)} aria-label={`Delete clip ${h.name}`}>
                                  <Trash2 size={16} aria-hidden="true" />
                                </button>
                              </div>
                            </div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                              Range: {formatTime(h.startTimestamp)} - {formatTime(h.endTimestamp)}
                            </div>
                            {h.notes && (
                              <div style={{ fontSize: '0.9rem', padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                                <strong>Note:</strong> {h.notes}
                              </div>
                            )}
                            {h.tags && h.tags.length > 0 && (
                              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                {h.tags.map(tag => (
                                  <span key={tag} style={{ fontSize: '0.8rem', padding: '0.1rem 0.4rem', background: 'var(--accent-glow)', border: '1px solid var(--accent)', borderRadius: '4px', color: 'var(--text-main)' }}>
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </>
            ) : activeTab === 'collections' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h3>Collections Manager</h3>
                
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input 
                    type="text" 
                    className="input" 
                    value={newCollectionName} 
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="Collection Name (e.g. Exam formulas)" 
                    aria-label="New collection name"
                    style={{ flex: 1 }}
                  />
                  <input 
                    type="text" 
                    className="input" 
                    value={newCollectionDesc} 
                    onChange={(e) => setNewCollectionDesc(e.target.value)}
                    placeholder="Short description" 
                    aria-label="New collection description"
                    style={{ flex: 2 }}
                  />
                  <button className="btn btn-primary" onClick={createCollection}>Create Collection</button>
                </div>

                {collections.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>No collections created yet</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {collections.map(col => {
                      const colHighlights = highlights.filter(h => h.collectionId === col.id)
                      
                      return (
                        <div key={col.id} style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                            <div>
                              <h4>{col.name}</h4>
                              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{col.description}</p>
                            </div>
                            <button className="btn" onClick={() => deleteCollection(col.id)} aria-label={`Delete collection ${col.name}`}>
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>
                          
                          {colHighlights.length === 0 ? (
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No highlights assigned to this collection</p>
                          ) : (
                            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: 0 }}>
                              {colHighlights.map(h => (
                                <li key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: 'rgba(0,0,0,0.1)', borderRadius: '6px' }}>
                                  <span>{h.name} ({formatTime(h.startTimestamp)} - {formatTime(h.endTimestamp)})</span>
                                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    <button className="btn" onClick={() => playClip(h, false)} aria-label={`Play clip ${h.name}`}>Play</button>
                                    <button className="btn" onClick={async () => {
                                      const updatedH = highlights.map(item => item.id === h.id ? { ...item, collectionId: null } : item)
                                      setHighlights(updatedH)
                                      announce('Removed from collection')
                                    }}>
                                      Remove
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : activeTab === 'stats' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h3>Listening Statistics</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Today's Listening Time</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--focus-ring)', marginTop: '0.5rem' }}>
                      {Math.ceil((stats[new Date().toISOString().split('T')[0]] || 0) / 60)} minutes
                    </div>
                  </div>
                  <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>All-Time Listening Time</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent)', marginTop: '0.5rem' }}>
                      {Math.ceil(Object.values(stats).reduce((acc, curr) => acc + curr, 0) / 60)} minutes
                    </div>
                  </div>
                </div>
                
                <h4>Daily Breakdown (Last 7 Days)</h4>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: 0 }}>
                  {Object.entries(stats).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7).map(([date, seconds]) => (
                    <li key={date} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                      <span>{date}</span>
                      <span>{Math.ceil(seconds / 60)} minutes</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : activeTab === 'settings' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h3>Application Settings</h3>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="setting-rewind">Auto-Rewind on Resume:</label>
                  <select 
                    id="setting-rewind"
                    className="input"
                    value={settings.rewindSeconds}
                    onChange={(e) => updateSetting('rewindSeconds', parseInt(e.target.value, 10))}
                    style={{ width: '150px' }}
                  >
                    <option value="0">Off</option>
                    <option value="3">3 seconds</option>
                    <option value="5">5 seconds</option>
                    <option value="10">10 seconds</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="setting-theme">Color Theme:</label>
                  <select 
                    id="setting-theme"
                    className="input"
                    value={settings.theme}
                    onChange={(e) => updateSetting('theme', e.target.value as any)}
                    style={{ width: '150px' }}
                  >
                    <option value="dark">Dark Theme</option>
                    <option value="light">Light Theme</option>
                    <option value="high-contrast">High Contrast</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="setting-size">Button & Text Size:</label>
                  <select 
                    id="setting-size"
                    className="input"
                    value={settings.buttonSize}
                    onChange={(e) => updateSetting('buttonSize', e.target.value as any)}
                    style={{ width: '150px' }}
                  >
                    <option value="small">Small Buttons</option>
                    <option value="normal">Normal Buttons</option>
                    <option value="large">Large Buttons</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="setting-speed">Default Playback Speed:</label>
                  <select 
                    id="setting-speed"
                    className="input"
                    value={settings.defaultSpeed}
                    onChange={(e) => updateSetting('defaultSpeed', parseFloat(e.target.value))}
                    style={{ width: '150px' }}
                  >
                    <option value="0.5">0.5x</option>
                    <option value="1.0">1.0x</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                    <option value="1.75">1.75x</option>
                    <option value="2.0">2.0x</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="setting-verbosity">Screen Reader Announcement Verbosity:</label>
                  <select 
                    id="setting-verbosity"
                    className="input"
                    value={settings.verbosity}
                    onChange={(e) => updateSetting('verbosity', e.target.value as any)}
                    style={{ width: '150px' }}
                  >
                    <option value="verbose">Verbose (All alerts)</option>
                    <option value="normal">Normal (Status alerts)</option>
                    <option value="minimal">Minimal (Errors only)</option>
                  </select>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h4>Software Auto-Updates</h4>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Current Version: <strong>1.0.0</strong> (Status: {updateStatus})</span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn" onClick={handleCheckForUpdates}>Check for Updates</button>
                      {updateStatus === 'downloaded' && (
                        <button className="btn btn-primary" onClick={handleInstallUpdate}>Restart & Install</button>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h4>Backup & Data Export</h4>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button className="btn" onClick={handleBackupDb}>Backup Database</button>
                    <button className="btn" onClick={handleRestoreDb}>Restore Database</button>
                    {bookId && (
                      <>
                        <button className="btn" onClick={handleExportBook}>Export Book Metadata</button>
                        <button className="btn" onClick={handleImportBook}>Import Book Metadata</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
                <h3>Help & User Guide</h3>
                <p>Welcome to the Accessible Audiobook Player! Here is a guide to using the application and its keyboard shortcuts.</p>
                
                <h4>Core Keyboard Shortcuts</h4>
                <ul style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <li><strong>Spacebar</strong>: Play / Pause</li>
                  <li><strong>Arrow Left / Right</strong>: Seek backward / forward 10 seconds</li>
                  <li><strong>Arrow Up / Down</strong>: Increase / decrease volume by 5% (volume can go up to 200% software boost!)</li>
                  <li><strong>Page Up / Page Down</strong>: Skip to previous / next non-skipped track</li>
                  <li><strong>Home / End</strong>: Jump to the start / end of the current track</li>
                  <li><strong>Slash (/)</strong>: Focus the "Jump to Time" box. Type time (e.g. 13:25) and press Enter to navigate.</li>
                </ul>

                <h4>Study Clip (Highlight) Shortcuts</h4>
                <ul style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <li><strong>[ (Left Bracket)</strong>: Mark Highlight Start Time at current playing second</li>
                  <li><strong>] (Right Bracket)</strong>: Mark Highlight End Time at current playing second</li>
                  <li><strong>Ctrl + H</strong>: Go to Highlights tab and focus the clip name label input box</li>
                  <li><strong>Ctrl + N</strong>: Move focus directly to the clip notes input field</li>
                  <li><strong>Ctrl + D</strong>: Save bookmark at current timestamp and focus name box</li>
                </ul>

                <h4>Speed & Mode Shortcuts</h4>
                <ul style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <li><strong>- (Minus) / + (Plus/Equals)</strong>: Decrease / increase playback speed by 0.1x (range 0.5x to 3.0x)</li>
                  <li><strong>S Key</strong>: Cycle speed through preset intervals (1.0x, 1.25x, 1.5x, etc.)</li>
                  <li><strong>R Key</strong>: Cycle Repeat mode (Off, Track repeat, Folder loop)</li>
                  <li><strong>H Key</strong>: Toggle Shuffle playback</li>
                  <li><strong>T Key</strong>: Toggle tab views between Clips and Statistics</li>
                  <li><strong>Ctrl + T</strong>: Cycle Sleep Timer (Off, 10 minutes, 20 minutes, or End of Track)</li>
                </ul>

                <h4>How to Create Highlights</h4>
                <p>Start playing an audio file. Press <strong>[</strong> to set the start timestamp and <strong>]</strong> to set the end timestamp. Type a name and notes, then click "Save Highlight". To repeat a saved clip, click the "Loop" button next to it.</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* HTML5 Audio Core */}
      <audio ref={audioRef} style={{ display: 'none' }} />

      {/* Footer Controls */}
      <footer className="player-bar" role="contentinfo" aria-label="Audio player controls">
        {/* Progress seek bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span aria-hidden="true">{formatTime(currentTime)}</span>
          <input 
            type="range" 
            min={0} 
            max={duration || 100} 
            value={currentTime} 
            onChange={(e) => {
              const targetVal = parseFloat(e.target.value)
              if (audioRef.current) audioRef.current.currentTime = targetVal
              setCurrentTime(targetVal)
            }}
            aria-label="Seek progress"
            aria-valuemin={0}
            aria-valuemax={duration || 100}
            aria-valuenow={currentTime}
            aria-valuetext={getAriaProgressText()}
            style={{ flex: 1, minWidth: '200px', cursor: 'pointer' }}
          />
          <span aria-hidden="true">{formatTime(duration)}</span>
          
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', marginLeft: 'auto' }}>
            <input 
              type="text" 
              className="input" 
              value={jumpTimeInput}
              onChange={(e) => setJumpTimeInput(e.target.value)}
              placeholder="Go to e.g. 13:25" 
              aria-label="Jump to duration (type minutes and seconds with colon, or total seconds)"
              style={{ width: '130px', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleJumpToTime()
                }
              }}
            />
            <button className="btn" onClick={handleJumpToTime} style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}>Go</button>
          </div>
        </div>

        {/* Playback action buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button className="btn" onClick={() => handleTrackChange('prev')} title="Previous track" aria-label="Previous Track">
              <SkipBack size={18} aria-hidden="true" />
            </button>
            <button className="btn" onClick={() => handleSeek('backward')} title="Seek backward" aria-label={`Seek backward ${skipInterval} seconds`}>
              -{skipInterval}s
            </button>
            <button className="btn btn-primary" onClick={handlePlayPause} style={{ padding: '0.75rem 1.5rem' }} aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause size={22} aria-hidden="true" /> : <Play size={22} aria-hidden="true" />}
            </button>
            <button className="btn" onClick={() => handleSeek('forward')} title="Seek forward" aria-label={`Seek forward ${skipInterval} seconds`}>
              +{skipInterval}s
            </button>
            <button className="btn" onClick={() => handleTrackChange('next')} title="Next track" aria-label="Next Track">
              <SkipForward size={18} aria-hidden="true" />
            </button>
            <button className="btn" onClick={handleStop} title="Stop playback" aria-label="Stop Playback">
              <Square size={18} aria-hidden="true" />
            </button>
            <button 
              className={`btn ${isShuffle ? 'btn-primary' : ''}`} 
              onClick={() => { setIsShuffle(!isShuffle); announce(isShuffle ? 'Shuffle off' : 'Shuffle on'); }} 
              title="Shuffle" 
              aria-label={`Shuffle play ${isShuffle ? 'active' : 'inactive'}`}
            >
              Shuffle
            </button>
            <button 
              className={`btn ${repeatMode !== 'off' ? 'btn-primary' : ''}`} 
              onClick={() => {
                const nextMode = repeatMode === 'off' ? 'track' : repeatMode === 'track' ? 'all' : 'off'
                setRepeatMode(nextMode)
                announce(`Repeat mode set to ${nextMode === 'off' ? 'repeat off' : nextMode === 'track' ? 'repeat single track' : 'repeat all tracks'}`)
              }} 
              title="Repeat" 
              aria-label={`Repeat mode: ${repeatMode === 'off' ? 'off' : repeatMode === 'track' ? 'repeat track' : 'repeat folder'}`}
            >
              Repeat: {repeatMode === 'off' ? 'Off' : repeatMode === 'track' ? 'Track' : 'Folder'}
            </button>
            <button 
              className={`btn ${sleepTimerActive ? 'btn-primary' : ''}`} 
              onClick={cycleSleepTimer}
              title="Sleep Timer" 
              aria-label={`Sleep timer: ${sleepMode === 'off' ? 'off' : sleepMode === 'track' ? 'end of track' : `${sleepTimer} minutes`}`}
            >
              Sleep: {sleepMode === 'off' ? 'Off' : sleepMode === 'track' ? 'Track' : `${sleepTimer}m`}
            </button>
          </div>

          {/* Volume and Boost controls */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button className="btn" onClick={() => { setIsMuted(!isMuted); announce(isMuted ? 'Volume unmuted' : 'Volume muted'); }} aria-label={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input 
              type="range" 
              min={0} 
              max={200} // Up to 200% sound boost
              value={isMuted ? 0 : volume} 
              onChange={(e) => {
                const targetVal = parseInt(e.target.value)
                setVolume(targetVal)
                if (isMuted) setIsMuted(false)
              }}
              aria-label={`Volume level slider (supports boost up to 200 percent)`}
              aria-valuemin={0}
              aria-valuemax={200}
              aria-valuenow={isMuted ? 0 : volume}
              aria-valuetext={`${isMuted ? 0 : volume} percent ${volume > 100 ? 'boost' : ''}`}
              style={{ width: '100px', cursor: 'pointer' }}
            />
            <span style={{ minWidth: '45px', fontSize: '0.9rem', color: volume > 100 ? 'var(--focus-ring)' : 'var(--text-main)' }}>
              {volume}% {volume > 100 && 'Boost'}
            </span>
          </div>

          {/* Playback Speed controller */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span id="speed-label" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Speed:</span>
            <select 
              className="input" 
              value={speed}
              onChange={(e) => {
                const targetVal = parseFloat(e.target.value)
                setSpeed(targetVal)
                announce(`Playback speed changed to ${targetVal}x`)
              }}
              aria-labelledby="speed-label"
              style={{ cursor: 'pointer' }}
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1.0">1.0x (Normal)</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="1.75">1.75x</option>
              <option value="2.0">2.0x</option>
              <option value="2.5">2.5x</option>
              <option value="3.0">3.0x</option>
            </select>
          </div>
        </div>
      </footer>
    </div>
  )
}
