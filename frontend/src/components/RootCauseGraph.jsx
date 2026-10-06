import React, { useState, useEffect, useRef } from "react";
import {
  Maximize2,
  RotateCcw,
  Sun,
  Battery,
  Thermometer,
  Disc,
  Zap,
  Compass,
  BarChart2,
  Info,
  Activity,
} from "lucide-react";

const ICON_MAP = {
  Sun,
  Battery,
  Thermometer,
  Disc,
  Zap,
  Compass,
  Activity,
  solar: Sun,
  battery: Battery,
  thermal: Thermometer,
  power: Zap,
  wheel: Disc,
  adcs: Compass,
  radiator: Thermometer,
};

function resolveIcon(icon, id) {
  if (typeof icon === "function" || (typeof icon === "object" && icon !== null)) return icon;
  if (typeof icon === "string") {
    const key = icon.toLowerCase();
    if (ICON_MAP[key]) return ICON_MAP[key];
  }
  if (id) {
    const idKey = id.toLowerCase();
    if (ICON_MAP[idKey]) return ICON_MAP[idKey];
  }
  return Sun;
}

const DEFAULT_NODES = [
  {
    id: "solar",
    label: "SOLAR ARRAY",
    status: "SOURCE",
    statusType: "source",
    x: 230,
    y: 20,
    icon: "Sun",
    metrics: [
      { label: "Current:", value: "2.1 A", highlight: true },
      { label: "Expected:", value: "4.0 A" },
      { label: "Deviation:", value: "-18%", highlight: true },
    ],
  },
  {
    id: "battery",
    label: "BATTERY",
    status: "AFFECTED",
    statusType: "affected",
    x: 230,
    y: 190,
    icon: "Battery",
    metrics: [
      { label: "Charge:", value: "65%", highlight: true },
      { label: "Expected:", value: "100%" },
      { label: "Deviation:", value: "-35%", highlight: true },
    ],
  },
  {
    id: "thermal",
    label: "THERMAL",
    status: "AFFECTED",
    statusType: "affected",
    x: 350,
    y: 350,
    icon: "Thermometer",
    metrics: [
      { label: "Temp:", value: "42.1°C", highlight: true },
      { label: "Expected:", value: "36.0°C" },
      { label: "Deviation:", value: "+6°C", highlight: true },
    ],
  },
  {
    id: "wheel",
    label: "REACTION WHEEL",
    status: "NORMAL",
    statusType: "normal",
    x: 80,
    y: 350,
    icon: "Disc",
    metrics: [
      { label: "Speed:", value: "3200 RPM" },
      { label: "Expected:", value: "3200 RPM" },
      { label: "Deviation:", value: "0%" },
    ],
  },
];

const DEFAULT_EDGES = [
  { source: "solar", target: "battery", label: "-18%", type: "red" },
  { source: "battery", target: "thermal", label: "+6°C", type: "red" },
  { source: "battery", target: "wheel", label: "Not affected", type: "gray" },
];

function layoutNodes(nodes) {
  if (!nodes || nodes.length === 0) return [];
  const layoutPresets = [
    [{ x: 230, y: 150 }],
    [{ x: 130, y: 150 }, { x: 370, y: 150 }],
    [{ x: 230, y: 30 }, { x: 90, y: 220 }, { x: 370, y: 220 }],
    [{ x: 230, y: 30 }, { x: 70, y: 180 }, { x: 390, y: 180 }, { x: 230, y: 330 }],
    [{ x: 230, y: 30 }, { x: 70, y: 150 }, { x: 390, y: 150 }, { x: 120, y: 320 }, { x: 340, y: 320 }],
    [{ x: 120, y: 30 }, { x: 340, y: 30 }, { x: 60, y: 180 }, { x: 400, y: 180 }, { x: 120, y: 330 }, { x: 340, y: 330 }]
  ];
  const preset = layoutPresets[Math.min(nodes.length, layoutPresets.length) - 1] || [];

  return nodes.map((node, i) => {
    const coords = (node.x != null && node.y != null)
      ? { x: node.x, y: node.y }
      : (preset[i] || { x: 60 + (i % 3) * 160, y: 40 + Math.floor(i / 3) * 180 });

    const isSource = node.status === 'SOURCE' || node.statusType === 'source' || node.state === 'anomaly' || (node.score && node.score > 0.5);
    const isAffected = node.status === 'AFFECTED' || node.statusType === 'affected' || (node.score && node.score > 0.1 && !isSource);
    const statusType = isSource ? 'source' : isAffected ? 'affected' : 'normal';
    const status = isSource ? 'SOURCE' : isAffected ? 'AFFECTED' : 'NORMAL';

    return {
      ...node,
      x: coords.x,
      y: coords.y,
      statusType,
      status,
      metrics: node.metrics || [
        { label: 'Score:', value: node.score != null ? `${(node.score * 100).toFixed(0)}%` : 'N/A', highlight: isSource },
        { label: 'Status:', value: status }
      ]
    };
  });
}

export default function RootCauseGraph({
  nodes: customNodes,
  edges: customEdges,
  selectedNodeId,
  onNodeSelect,
}) {
  const isInconclusive = Array.isArray(customNodes) && customNodes.length === 0;

  const [nodePositions, setNodePositions] = useState(() => {
    if (customNodes && customNodes.length > 0) {
      return layoutNodes(customNodes);
    }
    if (isInconclusive) return [];
    return DEFAULT_NODES;
  });

  useEffect(() => {
    if (customNodes && customNodes.length > 0) {
      setNodePositions(layoutNodes(customNodes));
    } else if (Array.isArray(customNodes) && customNodes.length === 0) {
      setNodePositions([]);
    } else {
      setNodePositions(DEFAULT_NODES);
    }
  }, [customNodes]);

  const edges = (customEdges && customEdges.length > 0) ? customEdges : (isInconclusive ? [] : DEFAULT_EDGES);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draggingNode, setDraggingNode] = useState(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const handleMouseDown = (e, nodeId) => {
    e.stopPropagation();
    onNodeSelect && onNodeSelect(nodeId);
    setDraggingNode(nodeId);
    const node = nodePositions.find((n) => n.id === nodeId);
    if (node) {
      dragOffset.current = {
        x: e.clientX - node.x,
        y: e.clientY - node.y,
      };
    }
  };

  const handleMouseMove = (e) => {
    if (draggingNode) {
      const newX = e.clientX - dragOffset.current.x;
      const newY = e.clientY - dragOffset.current.y;
      setNodePositions((prev) =>
        prev.map((n) =>
          n.id === draggingNode ? { ...n, x: newX, y: newY } : n,
        ),
      );
    }
  };

  const handleMouseUp = () => {
    setDraggingNode(null);
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setNodePositions((customNodes && customNodes.length > 0) ? customNodes : DEFAULT_NODES);
  };

  const handleFitView = () => {
    setZoom(0.95);
    setPan({ x: 10, y: 10 });
  };

  return (
    <div className="graph-card">
      <div className="graph-card-header">
        <div className="graph-title-row">
          <h2 className="graph-title">
            <span className="graph-icon-symbol">☊</span> Root-Cause Graph
          </h2>
          <Info size={16} className="info-icon" />
        </div>

        <div className="graph-controls">
          <button className="btn-graph-action" onClick={handleFitView}>
            <Maximize2 size={14} /> Fit View
          </button>
          <button className="btn-graph-action" onClick={handleReset}>
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      <div className="graph-legend-bar">
        <div className="legend-item">
          <span className="legend-dot source-dot"></span> Source
        </div>
        <div className="legend-item">
          <span className="legend-dot affected-dot"></span> Affected
        </div>
        <div className="legend-item">
          <span className="legend-dot normal-dot"></span> Normal
        </div>
        <div className="legend-item">
          <span className="legend-dash">--&gt;</span> Dependency
        </div>
      </div>

      {nodePositions.length === 0 ? (
        <div
          className="graph-canvas-container"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "420px",
            background: "rgba(15, 23, 42, 0.6)",
          }}
        >
          <div style={{ textAlign: "center", padding: "40px 20px", maxWidth: "480px" }}>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
                color: "#f87171",
              }}
            >
              <Activity size={26} />
            </div>
            <h3 style={{ color: "#f1f5f9", fontSize: "1.15rem", fontWeight: 600, marginBottom: "8px" }}>
              Root Cause Inconclusive
            </h3>
            <p style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: "1.6", margin: 0 }}>
              The causal inference engine could not isolate an unambiguous dependency graph from the telemetry residuals. Real-time telemetry monitoring remains active.
            </p>
          </div>
        </div>
      ) : (
        <div
          className="graph-canvas-container"
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ cursor: draggingNode ? "grabbing" : "default" }}
        >
          <svg className="graph-svg-layer" width="100%" height="520">
            <defs>
              <marker
                id="arrow-red"
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
              </marker>
              <marker
                id="arrow-gray"
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
              </marker>
            </defs>

            {/* Dynamic Edge Rendering */}
            {edges.map((edge, idx) => {
              const sId = edge.source || edge.from;
              const tId = edge.target || edge.to;
              const sNode = nodePositions.find(
                (n) => n.id === sId || String(n.id).toLowerCase() === String(sId).toLowerCase()
              );
              const tNode = nodePositions.find(
                (n) => n.id === tId || String(n.id).toLowerCase() === String(tId).toLowerCase()
              );
              if (!sNode || !tNode) return null;

              const isRed = edge.type === "red" || sNode.statusType === "source" || sNode.status === "SOURCE";
              const x1 = sNode.x + 100;
              const y1 = sNode.y + 110;
              const x2 = tNode.x + 100;
              const y2 = tNode.y;
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;

              return (
                <g key={idx} className="graph-edge-group">
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    className={`edge-line ${isRed ? "edge-active-red" : "edge-dashed-gray"}`}
                    markerEnd={isRed ? "url(#arrow-red)" : "url(#arrow-gray)"}
                  />
                  {edge.label && (
                    <>
                      <rect
                        x={midX - (edge.label.length > 8 ? 35 : 25)}
                        y={midY - 11}
                        width={edge.label.length > 8 ? 70 : 50}
                        height="22"
                        rx="4"
                        className={`edge-label-bg ${isRed ? "red" : "gray"}`}
                      />
                      <text
                        x={midX}
                        y={midY + 4}
                        textAnchor="middle"
                        className={`edge-label-text ${isRed ? "red" : "gray"}`}
                      >
                        {edge.label}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Nodes Layer */}
          <div
            className="graph-nodes-layer"
            style={{
              transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
            }}
          >
            {nodePositions.map((node) => {
              const IconComp = resolveIcon(node.icon, node.id);
              const isSelected = selectedNodeId === node.id;
              const statusClass = (node.statusType || "normal").toLowerCase();

              return (
                <div
                  key={node.id}
                  className={`graph-node-card ${statusClass} ${isSelected ? "selected" : ""}`}
                  style={{ left: `${node.x}px`, top: `${node.y}px` }}
                  onMouseDown={(e) => handleMouseDown(e, node.id)}
                >
                  <div className="node-card-header">
                    <div className="node-icon-title">
                      <IconComp
                        size={20}
                        className={`node-icon ${statusClass}`}
                      />
                      <span className="node-title">{node.label}</span>
                    </div>
                    <span className={`node-status-badge ${statusClass}`}>
                      {node.status}
                    </span>
                  </div>

                  <div className="node-card-body">
                    {node.metrics ? (
                      node.metrics.map((m, idx) => (
                        <div className="node-metric-row" key={idx}>
                          <span className="metric-name">{m.label}</span>
                          <span
                            className={`metric-val ${m.highlight ? statusClass : ""}`}
                          >
                            {m.value}
                          </span>
                        </div>
                      ))
                    ) : (
                      <>
                        <div className="node-metric-row">
                          <span className="metric-name">Value:</span>
                          <span className="metric-val">
                            {node.value || "N/A"}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="node-card-footer">
                    <BarChart2
                      size={16}
                      className={`node-spark-icon ${statusClass}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
