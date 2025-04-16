import { MelodyNote, Note, NoteLength } from '../types';

/**
 * Parses a melody string into an array of MelodyNote objects
 * @param melodyString A string in the format "C♩ D♩ E♩"
 * @returns Array of MelodyNote objects
 */
export const parseMelody = (melodyString: string): MelodyNote[] => {
  if (!melodyString) return [];
  
  const notes: MelodyNote[] = [];
  const noteParts = melodyString.split(' ');
  
  for (const part of noteParts) {
    if (part.length < 2) continue;
    
    const noteChar = part[0] as Note;
    const lengthChar = part.substring(1) as NoteLength;
    
    notes.push({
      note: noteChar,
      length: lengthChar
    });
  }
  
  return notes;
};

/**
 * Extracts just the note sequence (ignoring lengths) for the Simon gameplay
 * @param melodyString A string in the format "C♩ D♩ E♩"
 * @returns Array of Note characters ('C', 'D', etc.)
 */
export const extractNoteSequence = (melodyString: string): Note[] => {
  if (!melodyString) return [];
  
  const noteSequence: Note[] = [];
  const noteParts = melodyString.split(' ');
  
  for (const part of noteParts) {
    if (part.length < 2) continue;
    noteSequence.push(part[0] as Note);
  }
  
  return noteSequence;
}; 