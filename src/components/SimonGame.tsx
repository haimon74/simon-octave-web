import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { childrenTunes, popSongs } from '../data/melodies';
import { extractNoteSequence, parseMelody } from '../utils/melodyParser';
import { colorPalette, GameState, MelodyNote, Note, noteToColorMap, noteToIndexMap, noteLengthToMilliseconds } from '../types';
import '../styles/SimonGame.css';

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
    isPlaying: false
  });

  const [songCategory, setSongCategory] = useState<'children' | 'pop'>('children');
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [audioBuffers, setAudioBuffers] = useState<Record<Note, AudioBuffer>>({} as Record<Note, AudioBuffer>);
  const [melodyBank, setMelodyBank] = useState<Record<string, string>>(childrenTunes);
  const [soundsLoaded, setSoundsLoaded] = useState(false);

  // Load audio files
  useEffect(() => {
    const loadSounds = async () => {
      const context = new AudioContext();
      setAudioContext(context);

      const notes: Note[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
      const buffers: Record<Note, AudioBuffer> = {} as Record<Note, AudioBuffer>;

      try {
        const loadPromises = notes.map(async (note) => {
          const response = await fetch(`/assets/${note}4.wav`);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await context.decodeAudioData(arrayBuffer);
          buffers[note] = audioBuffer;
        });

        await Promise.all(loadPromises);
        setAudioBuffers(buffers);
        setSoundsLoaded(true);
      } catch (error) {
        console.error('Failed to load sounds:', error);
      }
    };

    loadSounds();

    return () => {
      if (audioContext) {
        audioContext.close();
      }
    };
  }, []);

  // Create SVG visualization
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const width = +svg.attr('width');
    const height = +svg.attr('height');
    const radius = Math.min(width, height) / 2;
    const innerRadius = radius * 0.3; // For center circle
    const center = { x: width / 2, y: height / 2 };
    const numSlices = 7;

    // Clear previous content
    svg.selectAll('*').remove();

    // Define gradients for 3D effect
    const defs = svg.append('defs');
    
    // Add filter for shadow effect
    defs.append('filter')
      .attr('id', 'shadow')
      .append('feDropShadow')
      .attr('dx', '0')
      .attr('dy', '0')
      .attr('stdDeviation', '4');

    // Create gradients for each color
    colorPalette.forEach((color, i) => {
      const gradient = defs.append('linearGradient')
        .attr('id', `gradient-${i}`)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '100%');
      
      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', d3.rgb(color).brighter(1.5).toString());
      
      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', d3.rgb(color).darker(1.2).toString());
    });

    // Create pie layout
    const pie = d3.pie<number>()
      .value(d => 1)
      .padAngle(0.02)
      .sort(null);

    // Create arc generator
    const arc = d3.arc<d3.PieArcDatum<number>>()
      .innerRadius(innerRadius)
      .outerRadius(radius);

    // Create slice group
    const sliceGroup = svg.append('g')
      .attr('transform', `translate(${center.x}, ${center.y})`);

    // Generate data array for the 7 slices
    const data = Array(numSlices).fill(1);

    // Create the slices
    const slices = sliceGroup.selectAll('.slice')
      .data(pie(data))
      .enter()
      .append('path')
      .attr('d', arc)
      .attr('class', 'slice')
      .attr('fill', (_, i) => `url(#gradient-${i})`)
      .attr('stroke', '#333')
      .attr('stroke-width', 2)
      .attr('data-index', (_, i) => i)
      .style('filter', 'url(#shadow)')
      .style('cursor', 'pointer');

    // Add the center circle
    svg.append('circle')
      .attr('cx', center.x)
      .attr('cy', center.y)
      .attr('r', innerRadius - 5)
      .attr('fill', '#333')
      .attr('class', 'inner-circle');

    // Simon game title in the center
    svg.append('text')
      .attr('x', center.x)
      .attr('y', center.y)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', 'white')
      .attr('font-size', '24px')
      .attr('font-family', 'Arial, sans-serif')
      .text('SIMON');

    // Add event listeners to slices
    slices.on('click', function(event, d) {
      if (!gameState.playerTurn || gameState.gameOver || gameState.isPlaying) return;
      
      const index = +d3.select(this).attr('data-index');
      handlePlayerInput(index);
    });

    slices.on('mouseenter', function() {
      if (gameState.gameOver || gameState.isPlaying) return;
      d3.select(this).transition().duration(100).attr('opacity', 0.8);
    });

    slices.on('mouseleave', function() {
      d3.select(this).transition().duration(100).attr('opacity', 1);
    });

  }, [gameState.gameOver, gameState.playerTurn, gameState.isPlaying]);

  // Play a sound
  const playSound = (note: Note, duration: number = 1000) => {
    if (!audioContext || !audioBuffers[note]) return;
    
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffers[note];
    source.connect(audioContext.destination);
    source.start();
    
    setTimeout(() => {
      source.stop();
    }, duration);
  };

  // Highlight a pad and play its sound
  const highlightPad = (index: number, duration: number = 1000) => {
    if (!svgRef.current) return;
    
    setGameState(prev => ({ ...prev, activePad: index }));
    
    // Get corresponding note for this index
    const noteEntry = Object.entries(noteToIndexMap).find(([_, idx]) => idx === index);
    if (noteEntry) {
      const note = noteEntry[0] as Note;
      playSound(note, duration);
    }
    
    const pad = d3.select(svgRef.current)
      .selectAll('.slice')
      .filter((_, i) => i === index);
    
    // Animate the pad
    pad.transition()
      .duration(100)
      .attr('opacity', 0.5)
      .attr('transform', 'scale(1.05)')
      .transition()
      .duration(duration - 100)
      .attr('opacity', 1)
      .attr('transform', 'scale(1)');
    
    // Clear the active pad after the duration
    setTimeout(() => {
      setGameState(prev => ({ ...prev, activePad: null }));
    }, duration);
  };

  // Play the current sequence
  const playSequence = async () => {
    if (gameState.sequence.length === 0 || !gameState.selectedSong) return;
    
    setGameState(prev => ({ ...prev, isPlaying: true, playerTurn: false }));
    
    // Get the full sequence up to the current round
    const sequenceToPlay = gameState.sequence.slice(0, gameState.round + 1);
    
    // Play each note in the sequence with delays
    for (let i = 0; i < sequenceToPlay.length; i++) {
      await new Promise(resolve => {
        const note = sequenceToPlay[i];
        const noteIndex = noteToIndexMap[note.note];
        
        setTimeout(() => {
          highlightPad(noteIndex, 1000);
          setTimeout(resolve, 1200); // Wait 1s for sound + 200ms gap
        }, i === 0 ? 500 : 0); // Start after a small delay
      });
    }
    
    // Switch to player's turn
    setGameState(prev => ({ 
      ...prev, 
      isPlaying: false, 
      playerTurn: true, 
      playerSequence: [] 
    }));
  };

  // Handle player input
  const handlePlayerInput = (padIndex: number) => {
    if (!gameState.playerTurn || gameState.isPlaying) return;
    
    // Highlight the pad that was clicked
    highlightPad(padIndex, 500);
    
    // Update player's sequence
    const updatedPlayerSequence = [...gameState.playerSequence, padIndex];
    setGameState(prev => ({ 
      ...prev, 
      playerSequence: updatedPlayerSequence 
    }));
    
    // Get the current sequence up to this round
    const currentSequence = gameState.sequence.slice(0, gameState.round + 1);
    
    // Check if the player's last input was correct
    const expectedPadIndex = noteToIndexMap[currentSequence[updatedPlayerSequence.length - 1].note];
    
    if (padIndex !== expectedPadIndex) {
      // Wrong input, game over
      handleGameOver();
      return;
    }
    
    // Check if the player has completed the sequence for this round
    if (updatedPlayerSequence.length === currentSequence.length) {
      // Player completed the sequence correctly
      const newScore = gameState.round + 1;
      const newHighScore = Math.max(newScore, gameState.highScore);
      
      setGameState(prev => ({
        ...prev,
        playerTurn: false,
        playerSequence: [],
        round: prev.round + 1,
        score: newScore,
        highScore: newHighScore
      }));
      
      // If player reached the end of the melody, continue in a circular fashion
      if (gameState.round + 1 >= gameState.sequence.length) {
        // Replay the full melody when the full sequence is completed
        setTimeout(() => {
          playFullMelody();
        }, 1000);
      } else {
        // Play the next sequence after a short delay
        setTimeout(() => {
          playSequence();
        }, 1000);
      }
    }
  };

  // Play the full melody with proper timing once the game is completed
  const playFullMelody = async () => {
    if (!gameState.selectedSong || !melodyBank[gameState.selectedSong]) return;
    
    setGameState(prev => ({ ...prev, isPlaying: true }));
    
    const fullMelodyString = melodyBank[gameState.selectedSong];
    const fullMelody = parseMelody(fullMelodyString);
    
    // Play each note with its proper duration
    for (let i = 0; i < fullMelody.length; i++) {
      await new Promise(resolve => {
        const note = fullMelody[i];
        const duration = noteLengthToMilliseconds[note.length];
        const noteIndex = noteToIndexMap[note.note];
        
        setTimeout(() => {
          highlightPad(noteIndex, duration);
          setTimeout(resolve, duration + 100); // Add small gap between notes
        }, i === 0 ? 500 : 0);
      });
    }
    
    setGameState(prev => ({ 
      ...prev, 
      isPlaying: false,
      playerTurn: true,
      round: 0 // Start from the beginning after full melody
    }));
    
    // Start a new round
    setTimeout(() => {
      playSequence();
    }, 1000);
  };

  // Handle game over
  const handleGameOver = () => {
    setGameState(prev => ({ ...prev, gameOver: true, playerTurn: false }));
    
    // Animate all pads for game over effect
    for (let i = 0; i < 7; i++) {
      setTimeout(() => {
        highlightPad(i, 300);
      }, i * 100);
    }
  };

  // Start a new game
  const startNewGame = () => {
    if (!melodyBank || Object.keys(melodyBank).length === 0) return;
    
    // Select a random song from the melody bank
    const songs = Object.keys(melodyBank);
    const randomSong = songs[Math.floor(Math.random() * songs.length)];
    const melodyString = melodyBank[randomSong];
    
    // Parse the melody to get the full sequence of notes and their lengths
    const fullMelody = parseMelody(melodyString);
    
    setGameState({
      sequence: fullMelody,
      playerTurn: false,
      playerSequence: [],
      round: 0,
      gameOver: false,
      activePad: null,
      score: 0,
      highScore: gameState.highScore,
      selectedSong: randomSong,
      isPlaying: false
    });
    
    // Start the first sequence after a delay
    setTimeout(() => {
      playSequence();
    }, 1000);
  };

  // Toggle between children's songs and pop songs
  const toggleSongCategory = () => {
    const newCategory = songCategory === 'children' ? 'pop' : 'children';
    setSongCategory(newCategory);
    setMelodyBank(newCategory === 'children' ? childrenTunes : popSongs);
  };

  return (
    <div className="simon-game-container">
      <div className="game-info">
        <h1>Simon Musical Memory Game</h1>
        {gameState.selectedSong && (
          <div className="song-info">
            <p>Current Song: <span>{gameState.selectedSong}</span></p>
          </div>
        )}
        <div className="score-display">
          <p>Score: <span>{gameState.score}</span></p>
          <p>High Score: <span>{gameState.highScore}</span></p>
        </div>
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
        {gameState.gameOver && <p className="game-over">Game Over!</p>}
        {gameState.playerTurn && <p className="turn-indicator">Your Turn! Repeat the sequence.</p>}
        {gameState.isPlaying && <p className="turn-indicator">Listen carefully...</p>}
        {!soundsLoaded && <p className="loading">Loading sounds...</p>}
      </div>
      
      <div className="game-board">
        <svg ref={svgRef} width="600" height="600"></svg>
      </div>
      
      <div className="game-instructions">
        <h2>How to Play</h2>
        <ol>
          <li>Simon will play a sequence of colors/sounds.</li>
          <li>Your job is to repeat the sequence in the same order.</li>
          <li>Each round, the sequence gets longer.</li>
          <li>See how long you can go without making a mistake!</li>
        </ol>
        <p className="note">The sequences follow famous melodies! Can you recognize the tune?</p>
      </div>
    </div>
  );
};

export default SimonGame; 