import React from 'react';
import { Clock, Sun, Battery, Thermometer, Activity, ChevronRight } from 'lucide-react';

const DEFAULT_EVENTS = [
  {
    id: 'e1',
    time: '02:09:40',
    title: 'Solar current ↓',
    desc: '18% below forecast',
    nodeId: 'solar',
    icon: Sun,
    dotColor: 'orange'
  },
  {
    id: 'e2',
    time: '02:10:15',
    title: 'Battery charge ↓',
    desc: '35% from nominal',
    nodeId: 'battery',
    icon: Battery,
    dotColor: 'orange'
  },
  {
    id: 'e3',
    time: '02:11:08',
    title: 'Battery temperature ↑',
    desc: '+6°C (42.1°C)',
    nodeId: 'thermal',
    icon: Thermometer,
    dotColor: 'red'
  },
  {
    id: 'e4',
    time: '02:11:20',
    title: 'Anomaly confirmed',
    desc: 'Score: 0.87 (threshold 0.45)',
    nodeId: 'solar',
    icon: Activity,
    dotColor: 'purple'
  }
];

export default function PropagationTimeline({ events = [], selectedEventId, onEventSelect }) {
  const displayEvents = events.length > 0 ? events : DEFAULT_EVENTS;

  return (
    <div className="card propagation-timeline-card">
      <div className="card-header-row">
        <h2 className="card-title">
          <Clock size={18} className="title-icon" /> Propagation Timeline
        </h2>
      </div>

      <div className="timeline-container">
        <div className="timeline-vertical-line"></div>
        {displayEvents.map((evt) => {
          const IconComponent = evt.icon || Activity;
          const isSelected = selectedEventId === evt.id;
          const colorClass = evt.dotColor || 'orange';

          return (
            <div
              key={evt.id}
              className={`timeline-item ${isSelected ? 'selected' : ''}`}
              onClick={() => onEventSelect && onEventSelect(evt.id)}
            >
              <div className={`timeline-dot ${colorClass}`}></div>

              <div className="timeline-time">{evt.time}</div>

              <div className={`timeline-icon-box ${colorClass}`}>
                <IconComponent size={16} />
              </div>

              <div className="timeline-content">
                <h4 className="timeline-item-title">{evt.title}</h4>
                <p className="timeline-item-desc">{evt.desc || evt.description}</p>
              </div>

              <ChevronRight size={16} className="timeline-arrow" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
