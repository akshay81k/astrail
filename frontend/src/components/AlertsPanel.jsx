import React from 'react';
import { useTelemetry } from '../context/TelemetryContext';
import { Bell, Thermometer, Sun, Info, ChevronRight } from 'lucide-react';

const alertItems = [
  {
    id: 'alert-1',
    severity: 'CRITICAL',
    time: '02:11:08',
    title: 'Thermal anomaly',
    description: 'Battery temperature rising',
    icon: Thermometer,
    colorClass: 'red'
  },
  {
    id: 'alert-2',
    severity: 'WARNING',
    time: '02:09:40',
    title: 'Solar current dropping',
    description: 'Current dropped below threshold',
    icon: Sun,
    colorClass: 'amber'
  },
  {
    id: 'alert-3',
    severity: 'INFO',
    time: '01:58:12',
    title: 'Sensor 3 delayed',
    description: 'Telemetry sync delay detected',
    icon: Info,
    colorClass: 'blue'
  }
];

export default function AlertsPanel() {
  const { activeAlertId, setActiveAlertId } = useTelemetry();

  const handleAlertClick = (id) => {
    setActiveAlertId(activeAlertId === id ? null : id);
  };

  return (
    <div className="alerts-container">
      <div className="alerts-header">
        <div className="title-row">
          <Bell size={18} className="icon-bell text-red" />
          <h2 className="section-title">ALERTS</h2>
        </div>
        <button className="btn-view-all">
          View All <ChevronRight size={14} />
        </button>
      </div>

      <div className="alerts-list">
        {alertItems.map((item) => {
          const Icon = item.icon;
          const isSelected = activeAlertId === item.id;
          return (
            <div
              key={item.id}
              onClick={() => handleAlertClick(item.id)}
              className={`alert-card alert-${item.colorClass} ${isSelected ? 'selected' : ''}`}
            >
              <div className={`alert-icon-box bg-${item.colorClass}`}>
                <Icon size={18} className={`icon-${item.colorClass}`} />
              </div>

              <div className="alert-content">
                <div className="alert-top-meta">
                  <span className="alert-time">{item.time}</span>
                  <span className={`badge badge-${item.colorClass}`}>
                    {item.severity}
                  </span>
                </div>
                <h4 className="alert-title">{item.title}</h4>
                <p className="alert-desc">{item.description}</p>
              </div>

              <ChevronRight size={16} className="alert-chevron" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
