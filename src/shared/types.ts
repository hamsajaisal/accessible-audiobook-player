export interface PlaybackState {
  isPlaying: boolean;
  filePath: string | null;
  fileName: string | null;
  position: number; // in seconds
  duration: number; // in seconds
  speed: number;
  volume: number;
}

export interface Bookmark {
  id: string;
  bookId: string; // folder path or file path
  filePath: string; // individual file path
  timestamp: number;
  name: string;
  description: string;
  createdAt: string;
}

export interface Highlight {
  id: string;
  bookId: string;
  filePath: string;
  startTimestamp: number;
  endTimestamp: number;
  name: string;
  notes: string;
  tags: string[];
  collectionId: string | null;
  createdAt: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
}

export interface BookHistory {
  bookId: string;
  lastFilePath: string;
  lastPosition: number;
  lastSpeed: number;
  lastVolume: number;
  lastPlayedAt: string;
}
