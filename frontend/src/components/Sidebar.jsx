import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  LineChart,
  SlidersHorizontal,
  AlertTriangle,
  BarChart3,
  Terminal,
  Wrench,
  FileText,
  Settings,
  Satellite
} from 'lucide-react';

const navItems = [
  { id: 'mission-control', label: 'Mission Control', icon: LayoutDashboard, path: '/' },
  { id: 'incidents', label: 'Incidents', icon: AlertTriangle, path: '/incidents' },
  { id: 'analysis', label: 'Detection Comparison', icon: BarChart3, path: '/analysis/comparison' },
  { id: 'fault-injection', label: 'Fault Injection', icon: Wrench, path: '/fault-injection' },
  { id: 'reports', label: 'Model Evaluation', icon: FileText, path: '/reports' }
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isIncidentsActive = location.pathname.startsWith('/incidents');
  const isFaultActive = location.pathname.startsWith('/fault-injection') || location.pathname.startsWith('/simulator/fault-injection');
  const isAnalysisActive = location.pathname.startsWith('/analysis');
  const isReportsActive = location.pathname.startsWith('/reports') || location.pathname.startsWith('/evaluation');

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo-icon">
          <Satellite size={24} className="logo-svg" />
        </div>
        <div className="sidebar-brand">
          <h1 className="brand-title">Astrail</h1>
          <span className="brand-subtitle">SPACECRAFT MONITOR</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          let isActive = false;
          if (item.id === 'incidents') isActive = isIncidentsActive;
          else if (item.id === 'fault-injection') isActive = isFaultActive;
          else if (item.id === 'analysis') isActive = isAnalysisActive;
          else if (item.id === 'reports') isActive = isReportsActive;
          else if (item.id === 'mission-control') isActive = location.pathname === '/';

          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
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




