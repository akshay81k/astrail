import React, { useState, useRef } from "react";
import {
  Maximize2,
  RotateCcw,
  Sun,
  Battery,
  Thermometer,
  Disc,
  BarChart2,
  Info,
} from "lucide-react";

const DEFAULT_NODES = [
  {
    id: "solar",
    label: "SOLAR ARRAY",
    status: "SOURCE",
    statusType: "source", // source, affected, normal
    x: 230,
    y: 20,
    icon: Sun,
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
    icon: Battery,
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
    icon: Thermometer,
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
    icon: Disc,
    metrics: [
      { label: "Speed:", value: "3200 RPM" },
      { label: "Expected:", value: "3200 RPM" },
      { label: "Deviation:", value: "0%" },
    ],
  },
];

export default function RootCauseGraph({
  nodes: customNodes,
  edges: customEdges,
  selectedNodeId,
  onNodeSelect,
}) {
  const [nodePositions, setNodePositions] = useState(() => {
    if (customNodes && customNodes.length > 0) {
      return customNodes;
    }
    return DEFAULT_NODES;
  });

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
    setNodePositions(DEFAULT_NODES);
  };

  const handleFitView = () => {
    setZoom(0.95);
    setPan({ x: 10, y: 10 });
  };

  // Find node by id
  const getNode = (id) =>
    nodePositions.find((n) => n.id === id) ||
    DEFAULT_NODES.find((n) => n.id === id);
  const solar = getNode("solar") || nodePositions[0];
  const battery = getNode("battery") || nodePositions[1];
  const thermal = getNode("thermal") || nodePositions[2];
  const wheel = getNode("wheel") || nodePositions[3];

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

          {/* Solar -> Battery Edge */}
          {solar && battery && (
            <g className="graph-edge-group">
              <line
                x1={solar.x + 100}
                y1={solar.y + 110}
                x2={battery.x + 100}
                y2={battery.y}
                className="edge-line edge-active-red"
              />
              <rect
                x={solar.x + 80}
                y={(solar.y + 110 + battery.y) / 2 - 12}
                width="40"
                height="22"
                rx="4"
                className="edge-label-bg red"
              />
              <text
                x={solar.x + 100}
                y={(solar.y + 110 + battery.y) / 2 + 3}
                className="edge-label-text red"
              >
                -18%
              </text>
            </g>
          )}

          {/* Battery -> Thermal Edge */}
          {battery && thermal && (
            <g className="graph-edge-group">
              <line
                x1={battery.x + 130}
                y1={battery.y + 110}
                x2={thermal.x + 70}
                y2={thermal.y}
                className="edge-line edge-active-red"
              />
              <rect
                x={(battery.x + 130 + thermal.x + 70) / 2 - 20}
                y={(battery.y + 110 + thermal.y) / 2 - 12}
                width="40"
                height="22"
                rx="4"
                className="edge-label-bg red"
              />
              <text
                x={(battery.x + 130 + thermal.x + 70) / 2}
                y={(battery.y + 110 + thermal.y) / 2 + 3}
                className="edge-label-text red"
              >
                +6°C
              </text>
            </g>
          )}

          {/* Battery -> Reaction Wheel Dashed Dependency Edge */}
          {battery && wheel && (
            <g className="graph-edge-group">
              <path
                d={`M ${battery.x + 20} ${battery.y + 60} Q ${battery.x - 60} ${battery.y + 120} ${wheel.x + 100} ${wheel.y}`}
                className="edge-line edge-dashed-gray"
                markerEnd="url(#arrow-gray)"
              />
              <rect
                x={battery.x - 70}
                y={battery.y + 90}
                width="70"
                height="22"
                rx="11"
                className="edge-label-bg gray"
              />
              <text
                x={battery.x - 35}
                y={battery.y + 105}
                className="edge-label-text gray"
              >
                Not affected
              </text>
            </g>
          )}
        </svg>

        {/* Nodes Layer */}
        <div
          className="graph-nodes-layer"
          style={{
            transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          {nodePositions.map((node) => {
            const IconComp = node.icon || Sun;
            const isSelected = selectedNodeId === node.id;
            const statusClass = node.statusType || "normal";

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
    </div>
  );
}
