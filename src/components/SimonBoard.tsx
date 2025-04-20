import React, { useState } from 'react';
import * as d3 from 'd3';
import SimonSlice from './SimonSlice';
import { Note, noteToIndexMap } from '../types';

interface SimonBoardProps {
  width: number;
  height: number;
  onSliceClick: (index: number) => void;
  activeSlice: number | null;
  isPlaying: boolean;
}

const SimonBoard: React.FC<SimonBoardProps> = ({
  width,
  height,
  onSliceClick,
  activeSlice,
  isPlaying
}) => {
  const radius = Math.min(width, height) / 2;
  const center = { x: width / 2, y: height / 2 };

  return (
    <svg width={width} height={height}>
      {/* Define the glow filter */}
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform={`translate(${center.x},${center.y})`}>
        {/* Render the slices */}
        {Array(7).fill(0).map((_, index) => (
          <SimonSlice
            key={index}
            index={index}
            isActive={activeSlice === index}
            onClick={onSliceClick}
            width={width}
            height={height}
            radius={radius}
          />
        ))}

        {/* Center circle */}
        <circle
          className="inner-circle"
          r={radius * 0.25}
          fill="#333"
          cursor="pointer"
        />

        {/* Status text */}
        <text
          className="status-text center-text"
          textAnchor="middle"
          dy="0.3em"
          fill="white"
          fontSize="16px"
        >
          {isPlaying ? 'Listen...' : 'Your Turn!'}
        </text>
      </g>
    </svg>
  );
};

export default SimonBoard; 