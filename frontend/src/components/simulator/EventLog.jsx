import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardList, Trash2 } from 'lucide-react';

export default function EventLog({ events = [], onClearEvents }) {
  return (
    <div className="event-log-card">
      <div className="event-log-header">
        <div className="event-log-title-row">
          <ClipboardList size={16} className="text-cyan" />
          <h3 className="event-log-title">EVENT LOG</h3>
        </div>
        <button
          type="button"
          className="event-log-clear-btn"
          onClick={onClearEvents}
          title="Clear Event Log"
        >
          <Trash2 size={12} />
          <span>Clear</span>
        </button>
      </div>

      <div className="event-log-body">
        {events.length === 0 ? (
          <div className="event-log-empty">No events logged yet</div>
        ) : (
          <div className="event-log-list">
            <AnimatePresence initial={false}>
              {events.map((evt) => {
                let badgeClass = 'tag-info';
                let badgeLabel = 'INFO';
                let dotClass = 'blue-dot';

                if (evt.severity === 'critical' || evt.severity === 'red') {
                  badgeClass = 'tag-critical';
                  badgeLabel = 'CRITICAL';
                  dotClass = 'red-dot';
                } else if (evt.severity === 'warning' || evt.severity === 'amber' || evt.severity === 'orange') {
                  badgeClass = 'tag-warning';
                  badgeLabel = 'WARNING';
                  dotClass = 'amber-dot';
                } else if (evt.severity === 'success' || evt.severity === 'green') {
                  badgeClass = 'tag-info';
                  badgeLabel = 'INFO';
                  dotClass = 'green-dot';
                }

                return (
                  <motion.div
                    key={evt.id || `${evt.timestamp}-${evt.text}`}
                    className="event-log-item"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="event-item-left">
                      <div className={`event-dot ${dotClass}`} />
                      <span className="event-timestamp">{evt.timestamp}</span>
                      <span className="event-text">{evt.text}</span>
                    </div>
                    <span className={`event-badge ${badgeClass}`}>
                      {evt.tag || badgeLabel}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
