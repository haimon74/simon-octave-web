export type Note = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export type NoteLength = '♩' | '♪' | '𝅗𝅥'; // Quarter, eighth, half notes

export interface MelodyNote {
  note: Note;
  length: NoteLength;
}

export interface GameState {
  sequence: MelodyNote[];
  playerTurn: boolean;
  playerSequence: number[];
  round: number;
  gameOver: boolean;
  activePad: number | null;
  score: number;
  highScore: number;
  selectedSong: string;
  isPlaying: boolean;
  actualPlayedSequence?: MelodyNote[];
}

export const noteToColorMap: Record<Note, string> = {
  'C': 'red',
  'D': 'orange',
  'E': 'yellow',
  'F': 'green',
  'G': 'blue',
  'A': 'indigo',
  'B': 'violet'
};

export const noteToIndexMap: Record<Note, number> = {
  'C': 0,
  'D': 1,
  'E': 2,
  'F': 3,
  'G': 4,
  'A': 5,
  'B': 6
};

export const colorPalette = [
  "red", "#FF7F00", "yellow", "green",
  "blue", "indigo", "violet"
];

export const noteLengthToMilliseconds: Record<NoteLength, number> = {
  '♩': 500, // quarter note = 1 beat = 500ms
  '♪': 250, // eighth note = 1/2 beat = 250ms
  '𝅗𝅥': 1000 // half note = 2 beats = 1000ms
}; 