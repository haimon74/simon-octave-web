import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { childrenTunes, popSongs } from '../data/melodies';
import { parseMelody } from '../utils/melodyParser';
import { colorPalette, GameState, Note, noteToIndexMap, noteLengthToMilliseconds } from '../types';
import '../styles/SimonGame.css';

// Extend Function interface to allow for the highlightPad property
interface HandleGameOverFunction extends Function {
  highlightPad?: (index: number, duration?: number) => void;
}

const PLAYER_TIMEOUT_SECONDS = 3;

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
  const playerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(PLAYER_TIMEOUT_SECONDS);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [songCategory, setSongCategory] = useState<'children' | 'pop'>('children');
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [audioBuffers, setAudioBuffers] = useState<Record<Note, AudioBuffer>>({} as Record<Note, AudioBuffer>);
  const [melodyBank, setMelodyBank] = useState<Record<string, string>>(childrenTunes);
  const [soundsLoaded, setSoundsLoaded] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [noteDuration, setNoteDuration] = useState<number>(500); // Changed from 1000 to 500

  // Add a ref to track the current game state
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
        } else {
          console.error(`Only ${successCount}/${notes.length} sounds loaded successfully`);
          // Still set the buffers we have, but mark as not fully loaded
          setAudioBuffers(buffers);
          setSoundsLoaded(false);
        }
        
        // Don't try to play a silent sound or resume the context here
        // This will be handled by the user gesture event listeners
        
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

  // Enable audio on any user interaction
  useEffect(() => {
    const unlockAudio = async () => {
      if (audioContext && (audioContext.state === 'suspended' || audioContext.state === 'closed')) {
        try {
          await audioContext.resume();
          console.log('Audio unlocked by user interaction!');
          setIsMuted(false);
          
          // Play a test sound to verify audio is working
          if (audioBuffers['C']) {
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffers['C'];
            source.connect(audioContext.destination);
            source.start(0);
            source.stop(0.1);
            console.log('Test sound played successfully');
          }
        } catch (err) {
          console.error('Failed to unlock audio:', err);
        }
      }
    };

    // Add event listeners to document for any user interaction
    const interactions = ['click', 'touchstart', 'keydown'];
    interactions.forEach(type => 
      document.addEventListener(type, unlockAudio, { once: true, passive: true })
    );

    // Clean up
    return () => {
      interactions.forEach(type => document.removeEventListener(type, unlockAudio));
    };
  }, [audioContext, audioBuffers]);

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
    if (audioContext.state === 'suspended' || audioContext.state === 'closed') {
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
      
      // Add a small buffer to ensure the full sound plays
      const stopPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          try {
            source.stop();
          } catch (error) {
            console.error('Error stopping sound:', error);
          }
          resolve();
        }, duration + 50); // Add 50ms buffer to ensure full sound plays
      });
      
      // Return the promise so we can await it
      return stopPromise;
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  }, [audioContext, audioBuffers, isMuted]);

  // Highlight a pad and play its sound
  const highlightPad = async (index: number) => {
    console.log('Highlighting pad:', index);
    const slice = d3.select(`.slice[data-index="${index}"]`);
    const activeSlice = slice.select('.active-slice');
    
    // Log the current state
    console.log('Current classes:', slice.attr('class'));
    console.log('Active slice opacity:', activeSlice.style('opacity'));
    
    // Activate the slice
    slice.classed('active', true);
    activeSlice.style('opacity', 1);
    
    // Log the new state
    console.log('New classes:', slice.attr('class'));
    console.log('New active slice opacity:', activeSlice.style('opacity'));

    // Play the sound
    if (!audioContext) return;
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Get corresponding note for this index
    const noteEntry = Object.entries(noteToIndexMap).find(([_, idx]) => idx === index);
    if (!noteEntry) return;
    const note = noteEntry[0] as Note;

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffers[note];
    const gainNode = audioContext.createGain();
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    gainNode.gain.value = 0.5;

    const startTime = audioContext.currentTime;
    source.start(startTime);
    source.stop(startTime + 0.5);

    // Deactivate after sound ends
    setTimeout(() => {
      console.log('Deactivating slice:', index);
      slice.classed('active', false);
      activeSlice.style('opacity', 0);
      console.log('Final classes:', slice.attr('class'));
      console.log('Final active slice opacity:', activeSlice.style('opacity'));
    }, 500);
  };

  // Handle game over effect - need the type annotation for the highlightPad property
  const handleGameOver = useCallback<HandleGameOverFunction>(() => {
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
        // Use the highlightPad property that will be set via useEffect
        if (handleGameOver.highlightPad) {
          handleGameOver.highlightPad(i, 300);
        }
      }, i * 100);
    }
  }, []);

  // Reset player timeout - call when player makes a move or when it's player's turn
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
    }, PLAYER_TIMEOUT_SECONDS * 1000); // Convert seconds to milliseconds
  }, [gameState.playerTurn, gameState.gameOver, handleGameOver]);

  // Play the sequence for the current round  
  const playSequence = useCallback(async (): Promise<void> => {
    console.log('playSequence called, validating state...');
    
    // Get the current game state from the ref
    const currentState = gameStateRef.current;
    console.log('Current game state:', {
      sequence: currentState.sequence,
      selectedSong: currentState.selectedSong,
      round: currentState.round,
      isPlaying: currentState.isPlaying
    });
    
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
    // If the round is -1 (first round), only show 1 note, otherwise use normal logic
    const sequenceToPlay = currentState.round === -1 
      ? currentState.sequence.slice(0, 1) 
      : currentState.sequence.slice(0, currentState.round + 2);
    
    // Log for debugging
    console.log(`Playing sequence: round ${currentState.round}, notes to play: ${sequenceToPlay.length}`);
    console.log('Sequence to play:', sequenceToPlay.map(note => note.note).join(', '));
    
    // Store the sequence we're playing to pass to player turn
    const actualSequenceToPlay = [...sequenceToPlay];
    
    // Add a safety timeout to recover from frozen state
    const safetyTimeoutId = setTimeout(() => {
      console.warn('Safety timeout triggered - forcing transition to player turn');
      const safetyState = {
        ...gameStateRef.current,
        isPlaying: false,
        playerTurn: true,
        actualPlayedSequence: actualSequenceToPlay
      };
      setGameState(safetyState);
      gameStateRef.current = safetyState;
      resetPlayerTimeout();
    }, 5000); // 5 seconds safety timeout
    
    try {
      // Play each note in the sequence with delays
      for (let i = 0; i < actualSequenceToPlay.length; i++) {
        const note = actualSequenceToPlay[i];
        const noteIndex = noteToIndexMap[note.note];
        
        console.log(`Playing note ${i+1}/${actualSequenceToPlay.length}: ${note.note} (index: ${noteIndex})`);
        console.log(`Note duration: ${noteDuration}ms, Note length: ${note.length}`);
        
        // Wait before playing the first note
        if (i === 0) {
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        
        // Play the note using the full noteDuration
        const gameSequenceDuration = noteDuration;
        console.log(`Actual play duration: ${gameSequenceDuration}ms`);
        highlightPad(noteIndex);
        
        // Wait for the note to complete plus a gap between notes
        const gapBetweenNotes = Math.max(150, gameSequenceDuration * 0.5);
        console.log(`Gap between notes: ${gapBetweenNotes}ms`);
        await new Promise(resolve => setTimeout(resolve, gameSequenceDuration + gapBetweenNotes));
      }
      
      console.log('Sequence playback complete, transitioning to player turn');
      
      // Clear the safety timeout since we completed normally
      clearTimeout(safetyTimeoutId);
      
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
      // Clear the safety timeout in case of error
      clearTimeout(safetyTimeoutId);
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
  }, [highlightPad, resetPlayerTimeout, noteDuration, melodyBank]);

  // Start a new game
  const startNewGame = useCallback(async () => {
    console.log('Starting new game...');
    
    // Force reset any stuck state
    const initialState = {
      sequence: [],
      playerTurn: false,
      playerSequence: [],
      round: 0,
      gameOver: false,
      activePad: null,
      score: 0,
      highScore: gameStateRef.current.highScore,
      selectedSong: '',
      isPlaying: false,
      actualPlayedSequence: undefined
    };
    
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
        
        // Load audio buffers
        const notes: Note[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        const buffers: Record<Note, AudioBuffer> = {} as Record<Note, AudioBuffer>;
        
        for (const note of notes) {
          try {
            const response = await fetch(`/assets/${note}4.wav`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await context.decodeAudioData(arrayBuffer);
            buffers[note] = audioBuffer;
            console.log(`Loaded sound for note ${note}`);
          } catch (err) {
            console.error(`Failed to load sound ${note}:`, err);
          }
        }
        
        setAudioBuffers(buffers);
        setSoundsLoaded(true);
      }
      
      // Ensure audio context is running
      if (audioContext) {
        console.log('Resuming audio context...');
        await audioContext.resume();
        setIsMuted(false);
      }
      
      // Select a random song from the melody bank
      const songs = Object.keys(melodyBank);
      const randomSong = songs[Math.floor(Math.random() * songs.length)];
      const melodyString = melodyBank[randomSong];
      
      // Parse the melody to get the full sequence of notes and their lengths
      const fullMelody = parseMelody(melodyString);
      
      if (!fullMelody || fullMelody.length === 0) {
        console.error('Failed to parse melody or empty melody');
        return;
      }
      
      console.log(`Starting new game with song "${randomSong}", melody length: ${fullMelody.length}`);
      
      // Create a new game state object
      const newGameState = {
        sequence: fullMelody,
        selectedSong: randomSong,
        round: -1,
        isPlaying: true,
        playerTurn: false,
        playerSequence: [],
        gameOver: false,
        activePad: null,
        score: 0,
        highScore: gameStateRef.current.highScore,
        actualPlayedSequence: undefined
      };
      
      // Update both the state and the ref
      setGameState(newGameState);
      gameStateRef.current = newGameState;
      
      // Start the first sequence
      console.log('Starting sequence playback for first round...');
      playSequence();
      
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
  }, [gameState.highScore, melodyBank, playSequence, audioContext, audioBuffers]);

  // Toggle between children's songs and pop songs
  const toggleSongCategory = useCallback(() => {
    const newCategory = songCategory === 'children' ? 'pop' : 'children';
    setSongCategory(newCategory);
    setMelodyBank(newCategory === 'children' ? childrenTunes : popSongs);
  }, [songCategory]);

  // Handle player input
  const handlePlayerInput = useCallback((padIndex: number) => {
    if (!gameState.playerTurn || gameState.gameOver || gameState.isPlaying) return;
    
    // Reset the player timeout when they make a move
    resetPlayerTimeout();
    
    // Highlight the pad that was clicked with full note duration
    highlightPad(padIndex);
    
    // Update player's sequence
    const updatedPlayerSequence = [...gameState.playerSequence, padIndex];
    setGameState(prev => ({ 
      ...prev, 
      playerSequence: updatedPlayerSequence 
    }));
    
    // Use the actual sequence that was played to the user
    // This ensures we're validating against exactly what the player heard
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
    
    console.log(`Player pressed pad ${padIndex}, expected pad ${expectedPadIndex} (note ${expectedNote})`);
    
    if (padIndex !== expectedPadIndex) {
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
        
        // Update center text to "Good Job!" before playing the melody
        if (svgRef.current) {
          d3.select(svgRef.current)
            .select('.center-text')
            .text('Good Job!')
            .attr('fill', '#4caf50');
        }
        
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
                }, i === 0 ? 500 : 0);
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
    resetPlayerTimeout
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

  // Fix circular dependency by setting highlightPad to handleGameOver
  useEffect(() => {
    // This properly connects the two functions and avoids the circular dependency
    handleGameOver.highlightPad = highlightPad;
  }, [handleGameOver, highlightPad]);

  // Create SVG visualization
  useEffect(() => {
    if (!svgRef.current) return;

    // Clear any existing content
    d3.select(svgRef.current).selectAll('*').remove();

    const width = 600;
    const height = 600;
    const radius = Math.min(width, height) / 2;

    // Create the SVG with proper namespace
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('xmlns', 'http://www.w3.org/2000/svg');

    // Create a group for the slices, centered in the SVG
    const g = svg.append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    // Create a pie layout for 7 equal slices
    const pie = d3.pie<number>()
      .value(() => 1)
      .sort(null);

    // Create an arc generator with adjusted inner and outer radius
    const arc = d3.arc<any>()
      .innerRadius(radius * 0.3)
      .outerRadius(radius * 0.9);

    // Create the slices
    const slices = g.selectAll('.slice')
      .data(pie(Array(7).fill(1)))
      .enter()
      .append('g')
      .attr('class', 'slice')
      .attr('data-index', (_, i) => i);

    // Add the main slice path
    slices.append('path')
      .attr('d', arc)
      .attr('class', 'main-slice')
      .attr('data-index', (_, i) => i)
      .style('stroke', '#333')
      .style('stroke-width', '2')
      .style('cursor', 'pointer')
      .style('fill', (_, i) => colorPalette[i]);

    // Add the active state path
    slices.append('path')
      .attr('d', arc)
      .attr('class', 'active-slice')
      .attr('data-index', (_, i) => i)
      .style('stroke', '#333')
      .style('stroke-width', '2')
      .style('opacity', 0)
      .style('fill', (_, i) => {
        const baseColor = d3.color(colorPalette[i]);
        if (baseColor) {
          return baseColor.brighter(2.5).toString();
        }
        return colorPalette[i];
      });

    // Add event listeners to the slices
    slices.on('click', (event, d) => {
      const index = d.index;
      handlePlayerInput(index);
    });

    // Add the center circle with adjusted radius
    g.append('circle')
      .attr('class', 'inner-circle')
      .attr('r', radius * 0.25)
      .attr('fill', '#333')
      .attr('cursor', 'pointer')
      .on('click', () => {
        if (!gameState.gameOver) return;
        startNewGame();
      });

    // Add the status text - create it after the center circle
    g.append('text')
      .attr('class', 'status-text center-text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .attr('fill', 'white')
      .attr('font-size', '16px')
      .text('');

  }, [gameState.gameOver, gameState.isPlaying, gameState.playerTurn, handlePlayerInput, startNewGame]);

  // Update center text based on game state
  useEffect(() => {
    if (!svgRef.current) return;
    
    const centerText = d3.select(svgRef.current)
      .select('.center-text');
      
    if (centerText.empty()) {
      console.warn('Center text element not found');
      return;
    }
    
    // Clear any existing timer display in center
    d3.select(svgRef.current).selectAll('.center-timer').remove();
    
    if (gameState.gameOver) {
      // Check if the center text already says "Good Job!" - if so, don't override it
      if (centerText.text() !== 'Good Job!') {
        centerText.text('Game Over!').attr('fill', '#f44336');
      }
    } else if (gameState.playerTurn) {
      centerText.text('Your Turn!').attr('fill', '#4a90e2');
      
      // Add timer circle inside the center
      const svg = d3.select(svgRef.current);
      const width = +svg.attr('width');
      const height = +svg.attr('height');
      const center = { x: width / 2, y: height / 2 };
      
      // Create timer container group
      const timerGroup = svg.append('g')
        .attr('class', 'center-timer')
        .attr('transform', `translate(${center.x}, ${center.y + 25})`);
      
      // Add timer text only
      timerGroup.append('text')
        .attr('x', 0)
        .attr('y', 5)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', timeRemaining <= 1 ? '#f44336' : '#4caf50')
        .attr('font-size', '14px')
        .attr('font-weight', 'bold')
        .text(`${timeRemaining}s`);
    } else if (gameState.isPlaying) {
      centerText.text('Listen...').attr('fill', '#4caf50');
    } else if (gameState.selectedSong) {
      centerText.text('Ready').attr('fill', '#fff');
    } else {
      centerText.text('');
    }
  }, [gameState, timeRemaining]);

  // Add this function before the return statement
  const renderColorPreview = (isActive: boolean) => {
    const width = 300;
    const height = 300;
    const radius = Math.min(width, height) / 2;

    // Define the colors to match the CSS
    const restColors = [
      '#e60000', // Red (C)
      '#ff8c00', // Orange (D)
      '#ffd700', // Yellow (E)
      '#008000', // Green (F)
      '#000080', // Blue (G)
      '#800080', // Purple (A)
      '#ff69b4'  // Pink (B)
    ];

    const activeColors = [
      '#ff3333', // Red (C)
      '#ffa64d', // Orange (D)
      '#fff299', // Yellow (E)
      '#00cc00', // Green (F)
      '#87ceeb', // Blue (G)
      '#cc66cc', // Purple (A)
      '#ff99cc'  // Pink (B)
    ];

    return (
      <div style={{ margin: '20px', display: 'inline-block' }}>
        <h3 style={{ textAlign: 'center', color: '#fff' }}>{isActive ? 'Active State' : 'Rest State'}</h3>
        <svg width={width} height={height}>
          <g transform={`translate(${width / 2},${height / 2})`}>
            {Array(7).fill(0).map((_, i) => {
              const startAngle = (i * 2 * Math.PI) / 7;
              const endAngle = ((i + 1) * 2 * Math.PI) / 7;
              
              const arc = d3.arc()
                .innerRadius(radius * 0.3)
                .outerRadius(radius * 0.9)
                .startAngle(startAngle)
                .endAngle(endAngle);
              
              const color = isActive ? activeColors[i] : restColors[i];

              return (
                <path
                  key={i}
                  d={arc({ startAngle, endAngle, innerRadius: radius * 0.3, outerRadius: radius * 0.9 }) || ''}
                  fill={color}
                  stroke="#333"
                  strokeWidth="2"
                />
              );
            })}
            <circle
              r={radius * 0.25}
              fill="#333"
            />
          </g>
        </svg>
      </div>
    );
  };

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
        <svg ref={svgRef} width="600" height="600"></svg>
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

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
        {renderColorPreview(false)}
        {renderColorPreview(true)}
      </div>
    </div>
  );
};

export default SimonGame; 