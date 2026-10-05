import React from 'react';
import {
  LayoutDashboard,
  LineChart,
  SlidersHorizontal,
  AlertTriangle,
  BarChart3,
  Terminal,
  FileText,
  Settings,
  Satellite
} from 'lucide-react';

const navItems = [
  { id: 'mission-control', label: 'Mission Control', icon: LayoutDashboard, active: true },
  { id: 'telemetry', label: 'Telemetry', icon: LineChart },
  { id: 'subsystems', label: 'Subsystems', icon: SlidersHorizontal },
  { id: 'incidents', label: 'Incidents', icon: AlertTriangle },
  { id: 'analysis', label: 'Analysis', icon: BarChart3 },
  { id: 'simulator', label: 'Simulator', icon: Terminal },
  { id: 'reports', label: 'Reports', icon: FileText }
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo-icon">
          <Satellite size={24} className="logo-svg" />
        </div>
        <div className="sidebar-brand">
          <h1 className="brand-title">INITIUM</h1>
          <span className="brand-subtitle">SPACECRAFT MONITOR</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${item.active ? 'active' : ''}`}
            >
              <Icon size={18} className="nav-icon" />
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Decorative Spacecraft Silhouette Background */}
      <div className="sidebar-watermark">
        <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="100" cy="100" r="80" stroke="rgba(37, 99, 235, 0.04)" strokeWidth="1" strokeDasharray="4 4" />
          <circle cx="100" cy="100" r="55" stroke="rgba(37, 99, 235, 0.06)" strokeWidth="1" />
          <path d="M60 140 L140 60 M70 150 L150 70" stroke="rgba(37, 99, 235, 0.05)" strokeWidth="1.5" />
          <path d="M90 110 L110 90 M85 105 L105 85" stroke="rgba(37, 99, 235, 0.08)" strokeWidth="2" />
        </svg>
      </div>

      <div className="sidebar-footer">
        <button className="nav-item">
          <Settings size={18} className="nav-icon" />
          <span className="nav-label">Settings</span>
        </button>
      </div>
    </aside>
  );
}
