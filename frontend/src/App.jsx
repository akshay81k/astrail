import React from 'react';
import { TelemetryProvider } from './context/TelemetryContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import SubsystemHealth from './components/SubsystemHealth';
import TelemetryPanel from './components/TelemetryPanel';
import AlertsPanel from './components/AlertsPanel';
import RecentEvents from './components/RecentEvents';
import SensorStatus from './components/SensorStatus';
import Footer from './components/Footer';
import { motion } from 'framer-motion';
import './App.css';

function MainDashboard() {
  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-layout">
        <Header />
        
        <main className="dashboard-content">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <SubsystemHealth />
          </motion.div>

          <motion.div
            className="main-grid"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <TelemetryPanel />
            <div className="right-panel">
              <AlertsPanel />
              <RecentEvents />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <SensorStatus />
          </motion.div>
        </main>

        <Footer />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <TelemetryProvider>
      <MainDashboard />
    </TelemetryProvider>
  );
}
