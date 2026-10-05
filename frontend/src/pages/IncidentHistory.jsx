import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from '../components/Sidebar';
import Footer from '../components/Footer';
import { useIncidents } from '../hooks/useIncidents';
import {
  FileWarning,
  TriangleAlert,
  CircleAlert,
  Info,
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  CircleDot,
  Loader2,
  RefreshCw,
  Inbox,
  Clock,
  ShieldAlert,
  Activity,
  BarChart3
} from 'lucide-react';

/* ─── SEVERITY CONFIG ─────────────────────────────────────── */
const SEVERITY_CONFIG = {
  critical: { label: 'CRITICAL', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', icon: TriangleAlert },
  warning:  { label: 'WARNING',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', icon: CircleAlert },
  info:     { label: 'INFO',     color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)',  icon: Info },
};
function getSev(sev) {
  return SEVERITY_CONFIG[sev?.toLowerCase()] || SEVERITY_CONFIG.info;
}

/* ─── STATUS CONFIG ───────────────────────────────────────── */
const STATUS_CONFIG = {
  open:         { label: 'Open',       color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   icon: CircleDot },
  analyzing:    { label: 'Analyzing',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: Loader2 },
  acknowledged: { label: "Ack'd",      color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   icon: CheckCircle },
  dismissed:    { label: 'Dismissed',  color: '#64748b', bg: 'rgba(100,116,139,0.1)', icon: XCircle },
  closed:       { label: 'Closed',     color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  icon: CheckCircle },
};
function getStat(status) {
  return STATUS_CONFIG[status?.toLowerCase()] || STATUS_CONFIG.open;
}

/* ─── SUMMARY CARD ────────────────────────────────────────── */
function SummaryCard({ icon: Icon, label, value, color, sub }) {
  return (
    <motion.div
      className="ih-summary-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ '--card-color': color }}
    >
      <div className="ih-summary-icon">
        <Icon size={20} />
      </div>
      <div className="ih-summary-body">
        <span className="ih-summary-label">{label}</span>
        <span className="ih-summary-value">{value}</span>
        {sub && <span className="ih-summary-sub">{sub}</span>}
      </div>
    </motion.div>
  );
}

/* ─── SEVERITY BADGE ──────────────────────────────────────── */
function SeverityBadge({ severity }) {
  const cfg = getSev(severity);
  const Icon = cfg.icon;
  return (
    <span
      className="ih-severity-badge"
      style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
    >
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

/* ─── STATUS BADGE ────────────────────────────────────────── */
function StatusBadge({ status }) {
  const cfg = getStat(status);
  const Icon = cfg.icon;
  return (
    <span
      className="ih-status-badge"
      style={{ color: cfg.color, background: cfg.bg }}
    >
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

/* ─── CONFIDENCE BAR ──────────────────────────────────────── */
function ConfidenceBar({ pct }) {
  if (pct == null) return <span className="ih-na">N/A</span>;
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="ih-conf-wrap">
      <span className="ih-conf-pct" style={{ color }}>{pct}%</span>
      <div className="ih-conf-track">
        <div className="ih-conf-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/* ─── SORT HEADER BUTTON ──────────────────────────────────── */
function SortBtn({ field, sortField, sortDir, onSort, children }) {
  const active = sortField === field;
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      className={`ih-sort-btn ${active ? 'active' : ''}`}
      onClick={() => onSort(field)}
      aria-label={`Sort by ${field}`}
    >
      {children}
      <Icon size={13} />
    </button>
  );
}

/* ─── SKELETON ROW ────────────────────────────────────────── */
function SkeletonRows({ count = 5 }) {
  return Array.from({ length: count }).map((_, i) => (
    <tr key={i} className="ih-skeleton-row">
      {Array.from({ length: 7 }).map((__, j) => (
        <td key={j}><div className="ih-skeleton-cell" /></td>
      ))}
    </tr>
  ));
}

/* ─── PAGINATION ──────────────────────────────────────────── */
function Pagination({ page, pageCount, total, pageSize, onPage }) {
  if (pageCount <= 1 && total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  // Generate page numbers with ellipsis
  const pages = useMemo(() => {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
    const arr = [];
    arr.push(1);
    if (page > 3) arr.push('…');
    for (let p = Math.max(2, page - 1); p <= Math.min(pageCount - 1, page + 1); p++) arr.push(p);
    if (page < pageCount - 2) arr.push('…');
    arr.push(pageCount);
    return arr;
  }, [page, pageCount]);

  return (
    <div className="ih-pagination">
      <span className="ih-pag-info">
        Showing <b>{total > 0 ? start : 0}–{end}</b> of <b>{total}</b> incidents
      </span>
      <div className="ih-pag-controls">
        <button
          className="ih-pag-btn"
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
        >
          ← Prev
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="ih-pag-ellipsis">…</span>
          ) : (
            <button
              key={p}
              className={`ih-pag-num ${p === page ? 'active' : ''}`}
              onClick={() => onPage(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          )
        )}
        <button
          className="ih-pag-btn"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

/* ─── MAIN PAGE ───────────────────────────────────────────── */
export default function IncidentHistory() {
  const navigate = useNavigate();
  const {
    incidents,
    loading,
    error,
    refetch,
    total,
    page, pageCount, setPage,
    search, setSearch,
    severityFilter, setSeverityFilter,
    statusFilter, setStatusFilter,
    sortField, setSortField,
    sortDir, setSortDir,
    summaryStats,
    PAGE_SIZE,
  } = useIncidents();

  const [searchInput, setSearchInput] = useState('');

  // Debounce search: commit on Enter or after 400 ms idle
  const searchTimer = React.useRef(null);
  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(val), 400);
  }, [setSearch]);

  const handleSort = useCallback((field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }, [sortField, setSortField, setSortDir]);

  const navigateToIncident = useCallback((id) => {
    navigate(`/incidents/${id}`);
  }, [navigate]);

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-layout">
        <main className="dashboard-content ih-page">

          {/* ── PAGE HEADER ───────────────────────────────── */}
          <div className="ih-page-header">
            <div>
              <h1 className="ih-header-title">
                <FileWarning size={22} className="ih-header-icon" />
                Incident History
              </h1>
              <p className="ih-header-sub">
                Review and analyze previously detected spacecraft anomalies
              </p>
            </div>
            <div className="ih-header-right">
              <button
                className="ih-refresh-btn"
                onClick={refetch}
                aria-label="Refresh incidents"
              >
                <RefreshCw size={15} />
                Refresh
              </button>
            </div>
          </div>

          {/* ── SUMMARY CARDS ─────────────────────────────── */}
          <div className="ih-summary-grid">
            <SummaryCard
              icon={Activity}
              label="Total Incidents"
              value={loading ? '—' : summaryStats.total}
              color="#3b82f6"
              sub="All sessions"
            />
            <SummaryCard
              icon={CircleDot}
              label="Open Incidents"
              value={loading ? '—' : summaryStats.open}
              color="#ef4444"
              sub="Requires attention"
            />
            <SummaryCard
              icon={ShieldAlert}
              label="Critical Severity"
              value={loading ? '—' : summaryStats.critical}
              color="#f59e0b"
              sub="High-priority events"
            />
            <SummaryCard
              icon={BarChart3}
              label="Avg Confidence"
              value={loading ? '—' : summaryStats.avgConfidence != null ? `${summaryStats.avgConfidence}%` : 'N/A'}
              color="#22c55e"
              sub="Root-cause accuracy"
            />
          </div>

          {/* ── INCIDENT LOG CARD ──────────────────────────── */}
          <div className="ih-log-card">
            <div className="ih-log-header">
              <div>
                <h2 className="ih-log-title">Incident Log</h2>
                <p className="ih-log-sub">Historical record of detected anomalies and their analysis results</p>
              </div>
            </div>

            {/* ── CONTROLS ─────────────────────────────────── */}
            <div className="ih-controls">
              {/* Search */}
              <div className="ih-search-wrap">
                <Search size={15} className="ih-search-icon" />
                <input
                  id="incident-search"
                  type="text"
                  className="ih-search-input"
                  placeholder="Search by ID, root cause, severity…"
                  value={searchInput}
                  onChange={handleSearchChange}
                  aria-label="Search incidents"
                />
              </div>

              {/* Severity Filter */}
              <div className="ih-filter-wrap">
                <Filter size={14} className="ih-filter-icon" />
                <select
                  className="ih-filter-select"
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  aria-label="Filter by severity"
                >
                  <option value="all">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="ih-filter-wrap">
                <Filter size={14} className="ih-filter-icon" />
                <select
                  className="ih-filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter by status"
                >
                  <option value="all">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="analyzing">Analyzing</option>
                  <option value="acknowledged">Acknowledged</option>
                  <option value="dismissed">Dismissed</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>

            {/* ── TABLE ────────────────────────────────────── */}
            <div className="ih-table-wrap">
              <table className="ih-table" role="table" aria-label="Incident history table">
                <thead>
                  <tr>
                    <th>
                      <SortBtn field="id" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                        ID
                      </SortBtn>
                    </th>
                    <th>
                      <SortBtn field="openedAtTs" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                        Time Detected
                      </SortBtn>
                    </th>
                    <th>
                      <SortBtn field="severity" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                        Severity
                      </SortBtn>
                    </th>
                    <th>Root Cause</th>
                    <th>
                      <SortBtn field="confidence" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                        Confidence
                      </SortBtn>
                    </th>
                    <th>
                      <SortBtn field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                        Status
                      </SortBtn>
                    </th>
                    <th className="ih-th-actions">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {loading && <SkeletonRows count={6} />}

                  {!loading && error && (
                    <tr>
                      <td colSpan={7} className="ih-state-cell">
                        <div className="ih-error-state">
                          <TriangleAlert size={24} />
                          <span>{error}</span>
                          <button className="ih-retry-btn" onClick={refetch}>
                            <RefreshCw size={14} /> Retry
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {!loading && !error && incidents.length === 0 && (
                    <tr>
                      <td colSpan={7} className="ih-state-cell">
                        <div className="ih-empty-state">
                          <Inbox size={32} />
                          <span>
                            {search || severityFilter !== 'all' || statusFilter !== 'all'
                              ? 'No incidents match your filters.'
                              : 'No incidents recorded yet.'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}

                  <AnimatePresence mode="popLayout">
                    {!loading && !error && incidents.map((inc, idx) => (
                      <motion.tr
                        key={inc.id}
                        className="ih-row"
                        role="row"
                        tabIndex={0}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18, delay: idx * 0.03 }}
                        onClick={() => navigateToIncident(inc.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigateToIncident(inc.id); }}
                        aria-label={`View incident ${inc.id}`}
                      >
                        <td>
                          <span className="ih-id-badge">#{inc.id}</span>
                        </td>
                        <td>
                          <div className="ih-time-stack">
                            <span className="ih-time-primary">
                              <Clock size={12} /> {inc.detectedTime}
                            </span>
                            {inc.detectedDate && (
                              <span className="ih-time-secondary">{inc.detectedDate}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <SeverityBadge severity={inc.severity} />
                        </td>
                        <td>
                          <span className="ih-root-cause" title={inc.rootCause}>
                            {inc.rootCause.length > 40
                              ? inc.rootCause.slice(0, 37) + '…'
                              : inc.rootCause}
                          </span>
                        </td>
                        <td>
                          <ConfidenceBar pct={inc.confidencePct} />
                        </td>
                        <td>
                          <StatusBadge status={inc.status} />
                        </td>
                        <td className="ih-td-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="ih-view-btn"
                            onClick={() => navigateToIncident(inc.id)}
                            aria-label={`View incident ${inc.id} detail`}
                          >
                            View <ChevronRight size={14} />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>

            {/* ── PAGINATION ────────────────────────────────── */}
            {!loading && !error && (
              <Pagination
                page={page}
                pageCount={pageCount}
                total={total}
                pageSize={PAGE_SIZE}
                onPage={setPage}
              />
            )}
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
