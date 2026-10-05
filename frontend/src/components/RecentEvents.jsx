import React from 'react';
import { Clock } from 'lucide-react';

const events = [
  { id: 1, time: '02:11:08', text: 'Thermal anomaly detected', color: 'red' },
  { id: 2, time: '02:09:40', text: 'Solar current dropped below threshold', color: 'amber' },
  { id: 3, time: '01:58:12', text: 'Sensor 3 data delayed', color: 'blue' },
  { id: 4, time: '01:45:20', text: 'Attitude subsystem nominal', color: 'green' },
  { id: 5, time: '01:32:05', text: 'Communication link stable', color: 'green' }
];

export default function RecentEvents() {
  return (
    <div className="recent-events-container">
      <div className="recent-events-header">
        <Clock size={16} className="events-icon" />
        <h3 className="events-title">Recent Events</h3>
      </div>

      <ul className="events-list">
        {events.map((evt) => (
          <li key={evt.id} className="event-item">
            <span className={`event-dot dot-${evt.color}`}></span>
            <span className="event-time">{evt.time}</span>
            <span className="event-text">{evt.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
