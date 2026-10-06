import React from 'react';
import {
  Clock,
  Sun,
  Battery,
  Thermometer,
  Activity,
  Zap,
  Compass,
  Disc,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';

const ICON_MAP = {
  sun: Sun,
  solar: Sun,
  solar_current: Sun,
  battery: Battery,
  battery_soc: Battery,
  battery_temp: Thermometer,
  battery_current: Battery,
  thermal: Thermometer,
  thermometer: Thermometer,
  heater: Thermometer,
  heater_state: Thermometer,
  power: Zap,
  zap: Zap,
  bus_voltage: Zap,
  load_power: Zap,
  wheel: Disc,
  wheel_speed: Disc,
  wheel_temp: Disc,
  disc: Disc,
  adcs: Compass,
  pointing_error: Compass,
  compass: Compass,
  activity: Activity,
};

function resolveEventIcon(item) {
  if (item.icon && typeof item.icon !== 'string') return item.icon;
  if (typeof item.icon === 'string') {
    const key = item.icon.toLowerCase();
    if (ICON_MAP[key]) return ICON_MAP[key];
  }
  if (item.nodeId && ICON_MAP[item.nodeId.toLowerCase()]) {
    return ICON_MAP[item.nodeId.toLowerCase()];
  }
  if (item.channel && ICON_MAP[item.channel.toLowerCase()]) {
    return ICON_MAP[item.channel.toLowerCase()];
  }
  return Activity;
}

const DEFAULT_EVENTS = [
  {
    id: 'e1',
    time: '02:09:40',
    title: 'Solar current ↓',
    desc: '18% below forecast',
    nodeId: 'solar',
    icon: Sun,
    dotColor: 'orange',
  },
  {
    id: 'e2',
    time: '02:10:15',
    title: 'Battery charge ↓',
    desc: '35% from nominal',
    nodeId: 'battery',
    icon: Battery,
    dotColor: 'orange',
  },
  {
    id: 'e3',
    time: '02:11:08',
    title: 'Battery temperature ↑',
    desc: '+6°C (42.1°C)',
    nodeId: 'thermal',
    icon: Thermometer,
    dotColor: 'red',
  },
  {
    id: 'e4',
    time: '02:11:20',
    title: 'Anomaly confirmed',
    desc: 'Score: 0.87 (threshold 0.45)',
    nodeId: 'solar',
    icon: Activity,
    dotColor: 'purple',
  },
];

function normalizeEvents(raw) {
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && Array.isArray(raw.events)) {
    list = raw.events;
  }

  // If raw is explicitly empty array or empty events array, return empty
  if (Array.isArray(raw) && raw.length === 0) return [];
  if (raw && Array.isArray(raw.events) && raw.events.length === 0) return [];
  if (!raw) return DEFAULT_EVENTS;
  if (!list || list.length === 0) return [];

  return list.map((item, idx) => {
    if (typeof item === 'string') {
      return {
        id: `e_${idx}`,
        time: `02:08:${String(10 + idx * 15).padStart(2, '0')}`,
        title: `Telemetry Sequence #${idx + 1}`,
        desc: item,
        nodeId: 'anomaly',
        icon: Activity,
        dotColor: idx === list.length - 1 ? 'purple' : 'orange',
      };
    }

    const id = item.id || `e_${idx}`;
    let time = item.time;
    if (!time) {
      const tVal = item.t !== undefined ? item.t : 10 + idx * 15;
      const mm = String(Math.floor((tVal + 480) / 60)).padStart(2, '0');
      const ss = String((tVal + 480) % 60).padStart(2, '0');
      time = `02:${mm}:${ss}`;
    }

    let title = item.title;
    if (!title && item.channel) {
      const formattedChannel = item.channel
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      title = `${formattedChannel} Anomaly`;
    } else if (!title) {
      title =
        idx === list.length - 1
          ? 'Anomaly Confirmed'
          : `Telemetry Onset Event #${idx + 1}`;
    }

    const desc =
      item.desc ||
      item.description ||
      item.event ||
      item.detail ||
      'Telemetry variance detected against nominal conformal envelope.';

    const dotColor =
      item.dotColor ||
      (idx === list.length - 1 ? 'purple' : idx >= 2 ? 'red' : 'orange');

    const icon = resolveEventIcon(item);

    return {
      id,
      time,
      title,
      desc,
      nodeId: item.nodeId || item.channel || 'anomaly',
      icon,
      dotColor,
    };
  });
}

export default function PropagationTimeline({
  events = [],
  selectedEventId,
  onEventSelect,
}) {
  const displayEvents = normalizeEvents(events);

  return (
    <div className="card propagation-timeline-card">
      <div className="card-header-row">
        <h2 className="card-title">
          <Clock size={18} className="title-icon" /> Propagation Timeline
        </h2>
      </div>

      {displayEvents.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: "#94a3b8" }}>
          <AlertTriangle size={24} style={{ color: "#f59e0b", marginBottom: "8px", display: "inline-block" }} />
          <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: "1.5" }}>
            No multi-stage causal propagation sequence available.
          </p>
        </div>
      ) : (
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
                  <p className="timeline-item-desc">{evt.desc}</p>
                </div>

                <ChevronRight size={16} className="timeline-arrow" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
