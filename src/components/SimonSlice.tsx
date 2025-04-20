import React, { useEffect } from 'react';
import * as d3 from 'd3';
import { baseColors, activeColors } from '../types';

interface SimonSliceProps {
  index: number;
  isActive: boolean;
  onClick: (index: number) => void;
  width: number;
  height: number;
  radius: number;
}

const SimonSlice: React.FC<SimonSliceProps> = ({ 
  index, 
  isActive, 
  onClick, 
  width, 
  height, 
  radius 
}) => {
  const sliceRef = React.useRef<SVGGElement>(null);

  useEffect(() => {
    if (!sliceRef.current) return;

    // Clear any existing content
    d3.select(sliceRef.current).selectAll('*').remove();

    // Create a pie layout for 7 equal slices
    const pie = d3.pie<number>()
      .value(() => 1)
      .sort(null);

    // Get the slice data
    const sliceData = pie(Array(7).fill(1))[index];

    // Create an arc generator with adjusted inner and outer radius
    const arc = d3.arc<any>()
      .innerRadius(radius * 0.4)
      .outerRadius(radius * 0.9)
      .startAngle(sliceData.startAngle + 0.025) // Reduced gap at start
      .endAngle(sliceData.endAngle - 0.025);    // Reduced gap at end

    // Create the slice group
    const sliceGroup = d3.select(sliceRef.current)
      .attr('class', `slice ${isActive ? 'active' : ''}`)
      .attr('data-index', index);

    // Add the main slice path
    sliceGroup.append('path')
      .attr('d', arc(sliceData))
      .attr('class', 'main-slice')
      .style('stroke', '#333')
      .style('stroke-width', '2')
      .style('cursor', 'pointer')
      .style('fill', baseColors[index]);

    // Add the active state path with glow effect
    sliceGroup.append('path')
      .attr('d', arc(sliceData))
      .attr('class', 'active-slice')
      .style('stroke', '#333')
      .style('stroke-width', '2')
      .style('opacity', isActive ? '1' : '0')
      .style('fill', activeColors[index])
      .style('filter', 'url(#glow)')
      .style('pointer-events', 'none')
      .style('transition', 'opacity 0.2s ease');

    // Add click handler
    sliceGroup.on('click', () => onClick(index));

  }, [index, isActive, onClick, radius]);

  return <g ref={sliceRef} />;
};

export default SimonSlice; 