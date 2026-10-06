import React from 'react';

export default function AttitudeIndicator() {
  return (
    <div className="attitude-indicator-widget">
      <div className="attitude-cube-wrapper">
        <svg viewBox="0 0 100 100" className="attitude-cube-svg">
          {/* Axis Labels */}
          <text x="50" y="14" fill="#38BDF8" fontSize="10" fontWeight="bold" textAnchor="middle">+Z</text>
          <text x="50" y="94" fill="#64748B" fontSize="10" textAnchor="middle">-Z</text>
          <text x="14" y="54" fill="#64748B" fontSize="10" textAnchor="middle">-X</text>
          <text x="86" y="54" fill="#EF4444" fontSize="10" fontWeight="bold" textAnchor="middle">+X</text>

          {/* Coordinate Circle & Crosshairs */}
          <circle cx="50" cy="50" r="32" fill="none" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx="50" cy="50" r="20" fill="none" stroke="rgba(56, 189, 248, 0.3)" strokeWidth="1" />
          <line x1="20" y1="50" x2="80" y2="50" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="1" />
          <line x1="50" y1="20" x2="50" y2="80" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="1" />

          {/* Isometric Gimbal Cube */}
          <g transform="translate(50, 50)">
            {/* Top Face */}
            <polygon
              points="0,-12 12,-6 0,0 -12,-6"
              fill="rgba(56, 189, 248, 0.35)"
              stroke="#38BDF8"
              strokeWidth="1"
            />
            {/* Left Face */}
            <polygon
              points="-12,-6 0,0 0,14 -12,8"
              fill="rgba(37, 99, 235, 0.25)"
              stroke="#38BDF8"
              strokeWidth="1"
            />
            {/* Right Face */}
            <polygon
              points="0,0 12,-6 12,8 0,14"
              fill="rgba(217, 119, 6, 0.45)"
              stroke="#F59E0B"
              strokeWidth="1"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}
