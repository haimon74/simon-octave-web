import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { childrenTunes, popSongs } from '../data/melodies';
import { parseMelody } from '../utils/melodyParser';
import { colorPalette, GameState, Note, noteToIndexMap, noteLengthToMilliseconds, baseColors, activeColors } from '../types';
import SimonBoard from './SimonBoard';
import '../styles/SimonGame.css';

// Extend Function interface to allow for the highlightPad property
interface HandleGameOverFunction extends Function {
  highlightPad?: (index: number, duration?: number) => void;
}

const PLAYER_TIMEOUT_SECONDS = 3;
const BOARD_SIZE = 600;

const SimonGame: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [gameState, setGameState] = useState<GameState>({
    sequence: [],
    playerTurn: false,
    playerSequence: [],
    round: 0,
    gameOver: false,
    activePad: null,
    score: 0,
    highScore: 0,
    selectedSong: '',
    isPlaying: false,
    actualPlayedSequence: undefined
  });

  // Define colors for the 7 slices
  const colors = ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3'];

  const [activeSlice, setActiveSlice] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(PLAYER_TIMEOUT_SECONDS);
  const [songCategory, setSongCategory] = useState<'children' | 'pop'>('children');
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [audioBuffers, setAudioBuffers] = useState<Record<Note, AudioBuffer>>({} as Record<Note, AudioBuffer>);
  const [melodyBank, setMelodyBank] = useState<Record<string, string>>(childrenTunes);
  const [soundsLoaded, setSoundsLoaded] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [noteDuration, setNoteDuration] = useState<number>(500);

  const playerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const gameStateRef = useRef<GameState>(gameState);

  // Update the ref whenever the state changes
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Load audio files
  useEffect(() => {
    const loadSounds = async () => {
      try {
        console.log('Initializing audio context...');
        const context = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioContext(context);
        
        // Always try to start with audio on, but browsers might block it initially
        setIsMuted(false);
        
        // Load all audio files in parallel
        const notes: Note[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        const buffers: Record<Note, AudioBuffer> = {} as Record<Note, AudioBuffer>;
        
        const loadPromises = notes.map(async (note) => {
          try {
            console.log(`Loading sound for note ${note}...`);
            const response = await fetch(`/assets/${note}4.wav`);
            if (!response.ok) {
              throw new Error(`Failed to fetch ${note}4.wav: ${response.status} ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await context.decodeAudioData(arrayBuffer);
            buffers[note] = audioBuffer;
            console.log(`Successfully loaded sound for note ${note}`);
            return true;
          } catch (err) {
            console.error(`Failed to load sound ${note}:`, err);
            return false;
          }
        });
        
        // Wait for all sounds to load
        const results = await Promise.all(loadPromises);
        const successCount = results.filter(Boolean).length;
        
        if (successCount === notes.length) {
          console.log('All sounds loaded successfully');
          setAudioBuffers(buffers);
          setSoundsLoaded(true);
          
          // Try to resume the context after loading
          try {
            await context.resume();
            console.log('Audio context resumed after loading sounds');
          } catch (err) {
            console.error('Failed to resume audio context after loading:', err);
          }
        } else {
          console.error(`Only ${successCount}/${notes.length} sounds loaded successfully`);
          // Still set the buffers we have, but mark as not fully loaded
          setAudioBuffers(buffers);
          setSoundsLoaded(false);
        }
      } catch (error) {
        console.error('Critical error initializing audio system:', error);
        setSoundsLoaded(false);
      }
    };

    loadSounds();

    return () => {
      if (audioContext) {
        audioContext.close();
      }
    };
  }, []);

  // Play a sound
  const playSound = useCallback(async (note: Note, duration: number = 1000) => {
    if (!audioContext) {
      console.error('Cannot play sound: AudioContext not available');
      return;
    }
    
    if (!audioBuffers[note]) {
      console.error(`Cannot play sound: Buffer for note ${note} not available`);
      return;
    }
    
    // Don't play sound if muted
    if (isMuted) {
      console.log('Sound muted, not playing:', note);
      return;
    }
    
    // Check if audio context is suspended and try to resume it
    if (audioContext.state === 'suspended') {
      try {
        console.log('Resuming audio context to play sound');
        await audioContext.resume();
      } catch (error) {
        console.error('Failed to resume audio context:', error);
        return;
      }
    }
    
    try {
      console.log(`Playing sound: ${note} with duration ${duration}ms, context state: ${audioContext.state}`);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffers[note];
      source.connect(audioContext.destination);
      source.start(0);
      
      // Return a promise that resolves when the sound is done playing
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          try {
            source.stop();
          } catch (error) {
            console.error('Error stopping sound:', error);
          }
          resolve();
        }, duration);
      });
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  }, [audioContext, audioBuffers, isMuted]);

  // Highlight a pad and play its sound
  const highlightPad = useCallback(async (index: number) => {
    console.log(`Highlighting pad ${index}`);
    setActiveSlice(index);
    
    // Play the sound
    const noteEntry = Object.entries(noteToIndexMap).find(([_, idx]) => idx === index);
    if (!noteEntry) {
      console.error(`No note found for index ${index}`);
      return;
    }
    const note = noteEntry[0] as Note;
    console.log('Playing note:', note);
    
    // Play the sound and wait for it to finish
    await playSound(note, noteDuration);
    
    // Deactivate the slice
    setActiveSlice(null);
  }, [playSound, noteDuration]);

  // Handle game over
  const handleGameOver = useCallback(() => {
    // Clear any pending timeout
    if (playerTimeoutRef.current) {
      clearTimeout(playerTimeoutRef.current);
      playerTimeoutRef.current = null;
    }
    
    // Clear timer interval
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    
    setGameState(prev => ({ ...prev, gameOver: true, playerTurn: false }));
    
    // Animate all pads for game over effect
    for (let i = 0; i < 7; i++) {
      setTimeout(() => {
        highlightPad(i);
      }, i * 100);
    }
  }, [highlightPad]);

  // Reset player timeout
  const resetPlayerTimeout = useCallback(() => {
    // Clear any existing timeout
    if (playerTimeoutRef.current) {
      clearTimeout(playerTimeoutRef.current);
      playerTimeoutRef.current = null;
    }
    
    // Clear any existing timer interval
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    
    // Reset time remaining
    setTimeRemaining(PLAYER_TIMEOUT_SECONDS);
    
    // Start countdown timer
    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          // Last second, clear the interval
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    // Set a new timeout
    playerTimeoutRef.current = setTimeout(() => {
      // If it's still player's turn and game is not over when timeout happens
      if (gameState.playerTurn && !gameState.gameOver) {
        handleGameOver();
      }
    }, PLAYER_TIMEOUT_SECONDS * 1000);
  }, [gameState.playerTurn, gameState.gameOver, handleGameOver]);

  // Play the sequence for the current round
  const playSequence = useCallback(async (): Promise<void> => {
    console.log('=== Starting Sequence Playback ===');
    console.log('Initial state:', {
      isPlaying: gameStateRef.current.isPlaying,
      playerTurn: gameStateRef.current.playerTurn,
      round: gameStateRef.current.round,
      selectedSong: gameStateRef.current.selectedSong
    });
    
    // Get the current game state from the ref
    const currentState = gameStateRef.current;
    
    // If we're already playing a sequence, don't start another one
    if (currentState.isPlaying) {
      console.log('Already playing a sequence, ignoring duplicate call');
      return;
    }
    
    // If the sequence is empty, try to get it from the melody bank
    if (!currentState.sequence || currentState.sequence.length === 0) {
      if (currentState.selectedSong && melodyBank[currentState.selectedSong]) {
        console.log('Re-parsing melody from selected song...');
        const fullMelody = parseMelody(melodyBank[currentState.selectedSong]);
        if (fullMelody && fullMelody.length > 0) {
          console.log('Successfully re-parsed melody, updating state...');
          const updatedState = {
            ...currentState,
            sequence: fullMelody
          };
          setGameState(updatedState);
          gameStateRef.current = updatedState;
          // Try again with updated state
          return playSequence();
        }
      }
      console.error('Invalid game state for sequence playback:', {
        sequence: currentState.sequence,
        selectedSong: currentState.selectedSong
      });
      return;
    }
    
    // Clear any pending timeout
    if (playerTimeoutRef.current) {
      clearTimeout(playerTimeoutRef.current);
      playerTimeoutRef.current = null;
    }
    
    // Mark that we're now playing a sequence
    console.log('Setting isPlaying to true');
    const playingState = { ...currentState, isPlaying: true, playerTurn: false };
    setGameState(playingState);
    gameStateRef.current = playingState;
    
    // Get the sequence up to the current round
    const sequenceToPlay = currentState.round === -1 
      ? currentState.sequence.slice(0, 1) 
      : currentState.sequence.slice(0, currentState.round + 2);
    
    // Log for debugging
    console.log(`Playing sequence: round ${currentState.round}, notes to play: ${sequenceToPlay.length}`);
    console.log('Sequence to play:', sequenceToPlay.map(note => note.note).join(', '));
    
    // Store the sequence we're playing to pass to player turn
    const actualSequenceToPlay = [...sequenceToPlay];
    
    try {
      // Ensure audio context is running
      if (!audioContext) {
        console.error('Audio context not available');
        throw new Error('Audio context not available');
      }

      if (audioContext.state === 'suspended') {
        console.log('Resuming audio context before sequence playback');
        await audioContext.resume();
      }

      // Play each note in the sequence with delays
      for (let i = 0; i < actualSequenceToPlay.length; i++) {
        const note = actualSequenceToPlay[i];
        const noteIndex = noteToIndexMap[note.note];
        
        console.log(`Playing note ${i+1}/${actualSequenceToPlay.length}: ${note.note} (index: ${noteIndex})`);
        
        // Wait before playing the first note
        if (i === 0) {
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        
        // Play the note
        await highlightPad(noteIndex);
        
        // Wait for the gap between notes
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      
      console.log('=== Sequence Playback Complete ===');
      console.log('Transitioning to player turn');
      
      // Transition to player's turn
      const completedState = {
        ...gameStateRef.current,
        isPlaying: false,
        playerTurn: true,
        playerSequence: [],
        actualPlayedSequence: actualSequenceToPlay
      };
      setGameState(completedState);
      gameStateRef.current = completedState;
      
      // Start the player timeout
      resetPlayerTimeout();
    } catch (error) {
      console.error('Error during sequence playback:', error);
      // Recover from error state
      const errorState = {
        ...gameStateRef.current,
        isPlaying: false,
        playerTurn: true,
        playerSequence: [],
        actualPlayedSequence: actualSequenceToPlay
      };
      setGameState(errorState);
      gameStateRef.current = errorState;
      resetPlayerTimeout();
    }
  }, [highlightPad, resetPlayerTimeout, noteDuration, melodyBank, audioContext]);

  // Start a new game
  const startNewGame = useCallback(async () => {
    console.log('=== Starting New Game ===');
    
    // Force reset any stuck state
    const initialState = {
      sequence: [],
      playerTurn: false,
      playerSequence: [],
      round: -1, // Start at -1 to show first note
      gameOver: false,
      activePad: null,
      score: 0,
      highScore: gameStateRef.current.highScore,
      selectedSong: '',
      isPlaying: false,
      actualPlayedSequence: undefined
    };
    
    console.log('Setting initial state:', initialState);
    setGameState(initialState);
    gameStateRef.current = initialState;
    
    // Clear any pending timeout
    if (playerTimeoutRef.current) {
      clearTimeout(playerTimeoutRef.current);
      playerTimeoutRef.current = null;
    }
    
    // Clear any existing timer interval
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    
    if (!melodyBank || Object.keys(melodyBank).length === 0) {
      console.error('No melodies available in melody bank');
      return;
    }
    
    try {
      // Initialize audio context if not already done
      if (!audioContext) {
        console.log('Creating new audio context...');
        const context = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioContext(context);
      }
      
      // Ensure audio context is running
      if (audioContext && audioContext.state === 'suspended') {
        console.log('Resuming audio context...');
        await audioContext.resume();
        setIsMuted(false);
      }
      
      // Select a random song from the melody bank
      const songs = Object.keys(melodyBank);
      const randomSong = songs[Math.floor(Math.random() * songs.length)];
      const melodyString = melodyBank[randomSong];
      
      console.log(`Selected song: "${randomSong}"`);
      
      // Parse the melody to get the full sequence of notes and their lengths
      const fullMelody = parseMelody(melodyString);
      
      if (!fullMelody || fullMelody.length === 0) {
        console.error('Failed to parse melody or empty melody');
        return;
      }
      
      console.log(`Parsed melody length: ${fullMelody.length}`);
      console.log('First few notes:', fullMelody.slice(0, 3).map(note => note.note).join(', '));
      
      // Create a new game state object
      const newGameState = {
        sequence: fullMelody,
        selectedSong: randomSong,
        round: -1,
        isPlaying: false, // Start as false, let playSequence handle this
        playerTurn: false,
        playerSequence: [],
        gameOver: false,
        activePad: null,
        score: 0,
        highScore: gameStateRef.current.highScore,
        actualPlayedSequence: undefined
      };
      
      console.log('Setting new game state:', newGameState);
      
      // Update both the state and the ref
      setGameState(newGameState);
      gameStateRef.current = newGameState;
      
      // Wait a moment before starting the sequence
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Start the first sequence
      console.log('Starting first sequence playback...');
      await playSequence();
      
      console.log('=== New Game Started ===');
      
    } catch (error) {
      console.error('Error starting new game:', error);
      // Reset game state to allow retry
      const errorState = {
        ...gameStateRef.current,
        gameOver: true,
        isPlaying: false
      };
      setGameState(errorState);
      gameStateRef.current = errorState;
    }
  }, [gameState.highScore, melodyBank, playSequence, audioContext]);

  // Toggle between children's songs and pop songs
  const toggleSongCategory = useCallback(() => {
    const newCategory = songCategory === 'children' ? 'pop' : 'children';
    setSongCategory(newCategory);
    setMelodyBank(newCategory === 'children' ? childrenTunes : popSongs);
  }, [songCategory]);

  // Handle slice click
  const handleSliceClick = useCallback((index: number) => {
    // Don't process clicks during Simon's sequence or if game is over
    if (gameState.isPlaying || gameState.gameOver) {
      console.log('Ignoring click - game is playing or over');
      return;
    }
    
    // Don't process clicks if it's not player's turn
    if (!gameState.playerTurn) {
      console.log('Ignoring click - not player\'s turn');
      return;
    }
    
    console.log('=== Player Input Start ===', new Date().getTime());
    
    // Reset the player timeout when they make a move
    resetPlayerTimeout();
    
    // Set the active slice immediately for visual feedback
    setActiveSlice(index);
    
    // Play the sound
    const noteEntry = Object.entries(noteToIndexMap).find(([_, idx]) => idx === index);
    if (!noteEntry) {
      console.error(`No note found for index ${index}`);
      return;
    }
    const note = noteEntry[0] as Note;
    console.log('Playing note:', note);
    
    // Play the sound and wait for it to finish
    playSound(note, noteDuration).then(() => {
      // Deactivate the slice after sound finishes
      setActiveSlice(null);
    });
    
    // Update player's sequence
    const updatedPlayerSequence = [...gameState.playerSequence, index];
    setGameState(prev => ({ 
      ...prev, 
      playerSequence: updatedPlayerSequence 
    }));
    
    // Use the actual sequence that was played to the user
    const expectedSequence = gameState.actualPlayedSequence || 
      (gameState.round === -1 
        ? gameState.sequence.slice(0, 1) 
        : gameState.sequence.slice(0, gameState.round + 2));
    
    console.log(`Player turn: round ${gameState.round}, expected sequence length: ${expectedSequence.length}, current input: ${updatedPlayerSequence.length}`);
    console.log('Expected sequence:', expectedSequence.map(note => `${note.note} (${noteToIndexMap[note.note]})`).join(', '));
    console.log('Player sequence so far:', updatedPlayerSequence.join(', '));
    
    // Determine which note the player should be inputting now
    const currentNoteIndex = updatedPlayerSequence.length - 1;
    const expectedNote = expectedSequence[currentNoteIndex].note;
    const expectedPadIndex = noteToIndexMap[expectedNote];
    
    console.log(`Player pressed pad ${index}, expected pad ${expectedPadIndex} (note ${expectedNote})`);
    
    if (index !== expectedPadIndex) {
      // Wrong input, game over
      console.log('❌ Wrong input! Game over.');
      handleGameOver();
      return;
    } else {
      console.log('✓ Correct input!');
    }
    
    // Check if the player has completed the sequence for this round
    if (updatedPlayerSequence.length === expectedSequence.length) {
      console.log('✅ Player completed the full sequence!');
      // Clear the timeout since they completed the round
      if (playerTimeoutRef.current) {
        clearTimeout(playerTimeoutRef.current);
        playerTimeoutRef.current = null;
      }
      
      // Player completed the sequence correctly
      const newScore = gameState.round + 1;
      const newHighScore = Math.max(newScore, gameState.highScore);
      
      // If player reached the end of the melody
      if (gameState.round + 1 >= gameState.sequence.length) {
        console.log('🎵 End of melody reached! Playing full melody as reward.');
        
        // Update state to show "Good Job!" and save final score
        setGameState(prev => ({
          ...prev,
          playerTurn: false,
          gameOver: true, // Mark as game over so we can start a new game
          score: newScore,
          highScore: newHighScore,
          actualPlayedSequence: undefined
        }));
        
        // Play the full melody with proper note lengths as a reward
        setTimeout(() => {
          // Play the full melody first without changing the game state
          const fullMelodyString = melodyBank[gameState.selectedSong];
          const fullMelody = parseMelody(fullMelodyString);
          
          // Create a function to play the melody without modifying game state
          const playCompleteWithTiming = async () => {
            setGameState(prev => ({ ...prev, isPlaying: true }));
            
            // Play each note with its proper duration
            for (let i = 0; i < fullMelody.length; i++) {
              // eslint-disable-next-line no-loop-func
              await new Promise<void>(resolve => {
                const note = fullMelody[i];
                // Get the actual duration from the note length
                const baseDuration = noteLengthToMilliseconds[note.length];
                const noteIndex = noteToIndexMap[note.note];
                
                // Add a consistent delay between notes for clarity
                setTimeout(() => {
                  // Play the note for its proper duration based on the note length
                  highlightPad(noteIndex);
                  
                  // Wait for the note's duration plus a small gap before resolving
                  const gap = Math.max(200, baseDuration * 0.3);
                  setTimeout(resolve, baseDuration + gap);
                }, 0);
              });
            }
            
            // End the melody playback
            setGameState(prev => ({ ...prev, isPlaying: false }));
          };
          
          // Play the complete melody
          playCompleteWithTiming();
        }, 1500);
      } else {
        console.log(`Moving to next round: ${gameState.round + 1}`);
        // Increase the round and continue the game
        setGameState(prev => ({
          ...prev,
          playerTurn: false,
          playerSequence: [],
          round: prev.round + 1,
          score: newScore,
          highScore: newHighScore,
          // Clear the actual played sequence since we're moving to a new round
          actualPlayedSequence: undefined
        }));
        
        // Play the next sequence after a short delay
        setTimeout(() => {
          playSequence();
        }, 1000);
      }
    }
  }, [
    gameState, 
    highlightPad, 
    handleGameOver, 
    playSequence, 
    resetPlayerTimeout,
    melodyBank,
    playSound,
    noteDuration
  ]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (playerTimeoutRef.current) {
        clearTimeout(playerTimeoutRef.current);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Create SVG visualization
  useEffect(() => {
    if (!svgRef.current) return;
    
    // Clear any existing SVG
    svgRef.current.innerHTML = '';
    
    // Create SVG with proper namespace
    const svg = d3.select(svgRef.current)
      .append('svg')
      .attr('width', BOARD_SIZE)
      .attr('height', BOARD_SIZE)
      .attr('viewBox', `0 0 ${BOARD_SIZE} ${BOARD_SIZE}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    // Add defs for filters and gradients
    const defs = svg.append('defs');

    // Add enhanced glow filter
    const glowFilter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');

    // Add a stronger blur for better glow
    glowFilter.append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', '8')
      .attr('result', 'blur');

    // Add color matrix to intensify the glow
    glowFilter.append('feColorMatrix')
      .attr('in', 'blur')
      .attr('mode', 'matrix')
      .attr('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7')
      .attr('result', 'glow');

    // Merge the original and the glow
    const feMerge = glowFilter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'glow');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Debug: Log the filter element
    console.log('Enhanced glow filter created:', {
      id: glowFilter.attr('id'),
      x: glowFilter.attr('x'),
      y: glowFilter.attr('y'),
      width: glowFilter.attr('width'),
      height: glowFilter.attr('height')
    });

    // Create a pie layout for 7 equal slices
    const pie = d3.pie<number>()
      .value(() => 1)
      .sort(null);

    // Create an arc generator
    const arc = d3.arc<d3.PieArcDatum<number>>()
      .innerRadius(BOARD_SIZE * 0.4 / 2)
      .outerRadius(BOARD_SIZE * 0.9 / 2);

    // Create a group for each slice
    const slices = svg.selectAll('.slice')
      .data(pie(Array(7).fill(1)))
      .enter()
      .append('g')
      .attr('class', 'slice')
      .attr('transform', `translate(${BOARD_SIZE / 2},${BOARD_SIZE / 2})`)
      .on('click', (event, d) => {
        const index = d.index;
        console.log('Slice clicked:', index);
        handleSliceClick(index);
      });

    // Add the main slice
    slices.append('path')
      .attr('class', 'main-slice')
      .attr('d', arc)
      .attr('fill', (d, i) => colors[i % colors.length]);

    // Add the active slice (initially hidden)
    slices.append('path')
      .attr('class', 'active-slice')
      .attr('d', arc)
      .attr('fill', (d, i) => colors[i % colors.length])
      .style('opacity', '0')
      .style('filter', 'url(#glow)');

    // Add center circle
    svg.append('circle')
      .attr('class', 'inner-circle')
      .attr('r', BOARD_SIZE * 0.35 / 2)
      .attr('cx', BOARD_SIZE / 2)
      .attr('cy', BOARD_SIZE / 2)
      .attr('fill', '#333')
      .on('click', () => {
        if (gameState.gameOver) {
          startNewGame();
        }
      });

    // Add center text
    svg.append('text')
      .attr('class', 'center-text')
      .attr('text-anchor', 'middle')
      .attr('dy', '.3em')
      .attr('fill', '#fff')
      .attr('x', BOARD_SIZE / 2)
      .attr('y', BOARD_SIZE / 2)
      .text(gameState.gameOver ? 'Game Over!' : 
            gameState.playerTurn ? 'Your Turn!' : 
            gameState.isPlaying ? 'Listen...' : 'Start');

    // Update active slices based on game state
    const updateActiveSlices = () => {
      slices.selectAll('.active-slice')
        .style('opacity', (d, i) => {
          const isActive = activeSlice === i;
          console.log(`Slice ${i} opacity: ${isActive ? '1' : '0'}`);
          return isActive ? '1' : '0';
        });
    };

    // Initial update
    updateActiveSlices();

    // Debug log for active slice state
    console.log('Current active slice:', activeSlice);
    console.log('SVG created with', slices.size(), 'slices');
  }, [gameState, handleSliceClick, startNewGame, gameState.activePad]);

  return (
    <div className="simon-game-container">
      {audioContext && (
        <button 
          onClick={async () => {
            if (audioContext) {
              try {
                if (isMuted) {
                  await audioContext.resume();
                  console.log('Audio unmuted by user interaction!');
                } else {
                  await audioContext.suspend();
                  console.log('Audio muted by user interaction!');
                }
                setIsMuted(!isMuted);
              } catch (err) {
                console.error('Failed to toggle audio:', err);
              }
            }
          }}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '24px',
            zIndex: 100,
            transition: 'all 0.2s ease'
          }}
          title={isMuted ? "Unmute sounds" : "Mute sounds"}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
      )}
      <div className="game-header">
        <h1 style={{ color: '#fff', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)' }}>Simon Musical Memory Game</h1>
        
        <div className="game-controls">
          <button 
            onClick={startNewGame} 
            disabled={!soundsLoaded || gameState.isPlaying}
            className="start-button"
          >
            {gameState.gameOver ? 'Play Again' : 'Start Game'}
          </button>
          <button 
            onClick={toggleSongCategory} 
            disabled={!soundsLoaded || gameState.isPlaying || !gameState.gameOver}
            className="toggle-button"
          >
            {songCategory === 'children' ? 'Switch to Pop Songs' : 'Switch to Children\'s Songs'}
          </button>
        </div>
        
        {!soundsLoaded && <p className="loading">Loading sounds...</p>}
      </div>
      
      <div className="game-board">
        <SimonBoard
          width={BOARD_SIZE}
          height={BOARD_SIZE}
          onSliceClick={handleSliceClick}
          activeSlice={activeSlice}
          isPlaying={gameState.isPlaying}
        />
      </div>
      
      <div className="game-info">
        {gameState.selectedSong && (
          <div className="song-info">
            <p>Current Song: <span>{gameState.selectedSong}</span></p>
            <p className="melody-string">Melody: <span>{melodyBank[gameState.selectedSong]}</span></p>
          </div>
        )}
        <div className="score-display">
          <p style={{ color: '#fff', textShadow: '1px 1px 2px rgba(0, 0, 0, 0.5)', fontWeight: 'bold' }}>Score: <span>{gameState.score}</span></p>
          <p style={{ color: '#fff', textShadow: '1px 1px 2px rgba(0, 0, 0, 0.5)', fontWeight: 'bold' }}>High Score: <span>{gameState.highScore}</span></p>
        </div>
      </div>
      
      <div className="game-instructions">
        <h2>How to Play</h2>
        <ol>
          <li>Simon will play a sequence of colored pads that represent musical notes.</li>
          <li>Each color corresponds to a note in the Do-Re-Mi (C-D-E-F-G-A-B) scale.</li>
          <li>Your job is to repeat the sequence by clicking the pads in the same order.</li>
          <li>Each round, the sequence gets longer by one note.</li>
          <li>The sequences are based on famous melodies and songs.</li>
          <li>If you complete an entire melody, you'll hear it played in full!</li>
          <li>You have 3 seconds to make each move - if you take too long, the game ends.</li>
        </ol>
        <p className="note">Listen carefully - can you recognize the tune as you progress?</p>
      </div>
    </div>
  );
};

export default SimonGame; 