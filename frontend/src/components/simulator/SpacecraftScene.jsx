import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Rotate3d, RefreshCw, Search, RotateCcw } from 'lucide-react';

// Camera controller with OrbitControls and smooth damping
function CameraController({ controlsRef }) {
  const { camera, gl } = useThree();

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 3.2;
    controls.maxDistance = 14;
    controls.maxPolarAngle = Math.PI * 0.88;
    controls.minPolarAngle = 0.12;
    controlsRef.current = controls;

    return () => {
      controls.dispose();
    };
  }, [camera, gl, controlsRef]);

  useFrame(() => {
    if (controlsRef.current) {
      controlsRef.current.update();
    }
  });

  return null;
}

// Deep Space Starfield Particles
function Starfield({ count = 1600 }) {
  const points = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const radius = 45 + (i % 35);
      const theta = (i * 1.6180339887) % (Math.PI * 2);
      const phi = Math.acos(((i * 2) / count) - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      // Star hues: electric cyan, ice blue, pure white, faint amber
      const mod = i % 10;
      if (mod === 0) {
        colors[i * 3] = 0.45; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 1.0;
      } else if (mod === 1) {
        colors[i * 3] = 0.95; colors[i * 3 + 1] = 0.98; colors[i * 3 + 2] = 1.0;
      } else if (mod === 2) {
        colors[i * 3] = 0.9; colors[i * 3 + 1] = 0.75; colors[i * 3 + 2] = 0.5;
      } else {
        colors[i * 3] = 0.7; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 1.0;
      }
    }
    return { positions, colors };
  }, [count]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[points.positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[points.colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.16}
        vertexColors
        transparent
        opacity={0.88}
        sizeAttenuation
      />
    </points>
  );
}

// Earth Horizon with atmospheric limb and city lights on night side
function EarthEnvironment() {
  const earthRef = useRef();

  return (
    <group position={[0, -20.5, -3]}>
      {/* Earth Main Sphere */}
      <mesh ref={earthRef} rotation={[0.45, 0.25, -0.1]}>
        <sphereGeometry args={[18, 64, 48]} />
        <meshStandardMaterial
          color="#08213F"
          roughness={0.65}
          metalness={0.15}
          emissive="#04142B"
          emissiveIntensity={0.4}
        />
      </mesh>

      {/* Atmospheric Limb Scattering Glow */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[18.25, 64, 32]} />
        <meshBasicMaterial
          color="#38BDF8"
          transparent
          opacity={0.22}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Outer Cyan Atmosphere Haze */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[18.45, 48, 24]} />
        <meshBasicMaterial
          color="#2563EB"
          transparent
          opacity={0.12}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Orbital Trajectory Ellipse Line */}
      <mesh rotation={[Math.PI / 2.3, 0.1, 0.3]} position={[0, 19, 2]}>
        <ringGeometry args={[10.5, 10.54, 128]} />
        <meshBasicMaterial
          color="#38BDF8"
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// High-Fidelity 3D Spacecraft Model
function Spacecraft({
  selectedSubsystem,
  hoveredSubsystem,
  onHoverSubsystem,
  onClickSubsystem,
  faultState,
  isPaused
}) {
  const groupRef = useRef();
  const reactionWheelRef = useRef();
  const pulseRef = useRef();

  // Idle rotation when simulation is running
  useFrame((state, delta) => {
    if (groupRef.current && !isPaused) {
      groupRef.current.rotation.y += delta * 0.06;
    }
    if (reactionWheelRef.current && !isPaused) {
      reactionWheelRef.current.rotation.x += delta * 3.2;
    }
    // Animate fault propagation pulse
    if (pulseRef.current && faultState.solar) {
      pulseRef.current.position.x = -0.8 - Math.abs(Math.sin(state.clock.elapsedTime * 2.5)) * 1.6;
    }
  });

  // State checks for highlighting
  const isSolarHovered = hoveredSubsystem === 'solar';
  const isSolarSelected = selectedSubsystem === 'solar';
  const isSolarFault = faultState.solar;

  const isBatteryHovered = hoveredSubsystem === 'battery';
  const isBatterySelected = selectedSubsystem === 'battery';
  const isBatteryFault = faultState.battery;

  const isAntennaHovered = hoveredSubsystem === 'antenna';
  const isAntennaSelected = selectedSubsystem === 'antenna';

  const isWheelHovered = hoveredSubsystem === 'wheel';
  const isWheelSelected = selectedSubsystem === 'wheel';
  const isWheelFault = faultState.wheel;

  const isThermalHovered = hoveredSubsystem === 'thermal';
  const isThermalSelected = selectedSubsystem === 'thermal';
  const isThermalFault = faultState.thermal;

  // Materials
  const goldBodyMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#D4AF37',
        metalness: 0.9,
        roughness: 0.28,
        emissive: '#524112',
        emissiveIntensity: 0.3
      }),
    []
  );

  const darkDeckMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#0F172A',
        metalness: 0.8,
        roughness: 0.3
      }),
    []
  );

  const titaniumStrutMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#64748B',
        metalness: 0.95,
        roughness: 0.15
      }),
    []
  );

  const solarCellMaterial = useMemo(() => {
    let emissiveColor = '#0B1F4B';
    let emissiveInt = 0.25;
    if (isSolarFault) {
      emissiveColor = '#F59E0B'; // Amber fault glow
      emissiveInt = 0.95;
    } else if (isSolarSelected) {
      emissiveColor = '#38BDF8';
      emissiveInt = 0.9;
    } else if (isSolarHovered) {
      emissiveColor = '#F59E0B';
      emissiveInt = 0.7;
    }
    return new THREE.MeshStandardMaterial({
      color: '#071A36',
      metalness: 0.7,
      roughness: 0.2,
      emissive: emissiveColor,
      emissiveIntensity: emissiveInt
    });
  }, [isSolarHovered, isSolarSelected, isSolarFault]);

  const batteryMaterial = useMemo(() => {
    let emissiveColor = '#0F1F38';
    let emissiveInt = 0.2;
    if (isBatteryFault) {
      emissiveColor = '#EF4444';
      emissiveInt = 0.95;
    } else if (isBatterySelected) {
      emissiveColor = '#DC2626';
      emissiveInt = 0.85;
    } else if (isBatteryHovered) {
      emissiveColor = '#F87171';
      emissiveInt = 0.7;
    }
    return new THREE.MeshStandardMaterial({
      color: '#1E293B',
      metalness: 0.85,
      roughness: 0.25,
      emissive: emissiveColor,
      emissiveIntensity: emissiveInt
    });
  }, [isBatteryHovered, isBatterySelected, isBatteryFault]);

  const antennaMaterial = useMemo(() => {
    let emissiveColor = '#1E293B';
    let emissiveInt = 0.1;
    if (isAntennaSelected) {
      emissiveColor = '#38BDF8';
      emissiveInt = 0.9;
    } else if (isAntennaHovered) {
      emissiveColor = '#38BDF8';
      emissiveInt = 0.6;
    }
    return new THREE.MeshStandardMaterial({
      color: '#E2E8F0',
      metalness: 0.9,
      roughness: 0.2,
      emissive: emissiveColor,
      emissiveIntensity: emissiveInt
    });
  }, [isAntennaHovered, isAntennaSelected]);

  const thermalMaterial = useMemo(() => {
    let emissiveColor = '#1C1033';
    let emissiveInt = 0.2;
    if (isThermalFault) {
      emissiveColor = '#8B5CF6';
      emissiveInt = 0.95;
    } else if (isThermalSelected) {
      emissiveColor = '#A855F7';
      emissiveInt = 0.85;
    } else if (isThermalHovered) {
      emissiveColor = '#C084FC';
      emissiveInt = 0.65;
    }
    return new THREE.MeshStandardMaterial({
      color: '#2E1065',
      metalness: 0.75,
      roughness: 0.35,
      emissive: emissiveColor,
      emissiveIntensity: emissiveInt
    });
  }, [isThermalHovered, isThermalSelected, isThermalFault]);

  const wheelMaterial = useMemo(() => {
    let emissiveColor = '#06192E';
    let emissiveInt = 0.2;
    if (isWheelFault) {
      emissiveColor = '#F59E0B';
      emissiveInt = 0.9;
    } else if (isWheelSelected) {
      emissiveColor = '#38BDF8';
      emissiveInt = 0.85;
    } else if (isWheelHovered) {
      emissiveColor = '#7DD3FC';
      emissiveInt = 0.65;
    }
    return new THREE.MeshStandardMaterial({
      color: '#0F172A',
      metalness: 0.9,
      roughness: 0.2,
      emissive: emissiveColor,
      emissiveIntensity: emissiveInt
    });
  }, [isWheelHovered, isWheelSelected, isWheelFault]);

  return (
    <group ref={groupRef} position={[0, 0.25, 0]}>
      {/* 1. CENTRAL SATELLITE BUS */}
      <group>
        {/* Main Body (Gold MLI Thermal Foil) */}
        <mesh position={[0, 0, 0]} material={goldBodyMaterial}>
          <boxGeometry args={[1.7, 2.2, 1.7]} />
        </mesh>

        {/* Avionics Top Deck Plate */}
        <mesh position={[0, 1.15, 0]} material={darkDeckMaterial}>
          <boxGeometry args={[1.6, 0.12, 1.6]} />
        </mesh>

        {/* Optical Sensor / Star Tracker Payload Tube on top deck */}
        <mesh position={[0.4, 1.45, -0.4]} material={titaniumStrutMaterial}>
          <cylinderGeometry args={[0.18, 0.22, 0.5, 24]} />
        </mesh>
        <mesh position={[0.4, 1.71, -0.4]}>
          <circleGeometry args={[0.16, 24]} />
          <meshBasicMaterial color="#0284C7" />
        </mesh>

        {/* Bottom Propulsion & Separation Ring */}
        <mesh position={[0, -1.16, 0]} material={darkDeckMaterial}>
          <cylinderGeometry args={[0.75, 0.82, 0.18, 32]} />
        </mesh>

        {/* Thruster Rocket Nozzles at base */}
        {[
          [0.35, -1.35, 0.35],
          [-0.35, -1.35, 0.35],
          [0.35, -1.35, -0.35],
          [-0.35, -1.35, -0.35]
        ].map(([tx, ty, tz], idx) => (
          <mesh key={`thruster-${idx}`} position={[tx, ty, tz]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.12, 0.25, 16]} />
            <meshStandardMaterial color="#B45309" metalness={0.9} roughness={0.3} />
          </mesh>
        ))}

        {/* Corner Titanium Structural Beams */}
        {[-0.82, 0.82].map((x) =>
          [-0.82, 0.82].map((z) => (
            <mesh key={`strut-${x}-${z}`} position={[x, 0, z]} material={titaniumStrutMaterial}>
              <cylinderGeometry args={[0.035, 0.035, 2.2, 8]} />
            </mesh>
          ))
        )}
      </group>

      {/* 2. SOLAR PANELS (PORT & STARBOARD WINGS) */}
      <group
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverSubsystem('solar');
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverSubsystem(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClickSubsystem('solar');
        }}
      >
        {/* Port Wing */}
        <group position={[-0.85, 0, 0]}>
          <mesh position={[-0.6, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={titaniumStrutMaterial}>
            <cylinderGeometry args={[0.045, 0.045, 1.2, 12]} />
          </mesh>
          <mesh position={[-2.45, 0, 0]} rotation={[0, -0.22, 0]}>
            <boxGeometry args={[2.5, 1.5, 0.05]} />
            <primitive object={solarCellMaterial} />
          </mesh>
          <mesh position={[-2.45, 0, 0]} rotation={[0, -0.22, 0]} material={darkDeckMaterial}>
            <boxGeometry args={[2.55, 1.55, 0.04]} />
          </mesh>
          {[-1.65, -2.45, -3.25].map((gx) => (
            <mesh key={`port-g-${gx}`} position={[gx, 0, 0.03]} rotation={[0, -0.22, 0]}>
              <boxGeometry args={[0.02, 1.48, 0.01]} />
              <meshStandardMaterial color="#38BDF8" emissive="#38BDF8" emissiveIntensity={0.5} />
            </mesh>
          ))}
        </group>

        {/* Starboard Wing */}
        <group position={[0.85, 0, 0]}>
          <mesh position={[0.6, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={titaniumStrutMaterial}>
            <cylinderGeometry args={[0.045, 0.045, 1.2, 12]} />
          </mesh>
          <mesh position={[2.45, 0, 0]} rotation={[0, 0.22, 0]}>
            <boxGeometry args={[2.5, 1.5, 0.05]} />
            <primitive object={solarCellMaterial} />
          </mesh>
          <mesh position={[2.45, 0, 0]} rotation={[0, 0.22, 0]} material={darkDeckMaterial}>
            <boxGeometry args={[2.55, 1.55, 0.04]} />
          </mesh>
          {[1.65, 2.45, 3.25].map((gx) => (
            <mesh key={`star-g-${gx}`} position={[gx, 0, 0.03]} rotation={[0, 0.22, 0]}>
              <boxGeometry args={[0.02, 1.48, 0.01]} />
              <meshStandardMaterial color="#38BDF8" emissive="#38BDF8" emissiveIntensity={0.5} />
            </mesh>
          ))}
        </group>

        {/* Fault Propagation Energy Pulse Dot */}
        {faultState.solar && (
          <mesh ref={pulseRef} position={[-2.4, 0, 0.1]}>
            <sphereGeometry args={[0.09, 16, 16]} />
            <meshBasicMaterial color="#F59E0B" />
          </mesh>
        )}
      </group>

      {/* 3. BATTERY & EPS MODULE */}
      <group
        position={[0, -0.45, 0.88]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverSubsystem('battery');
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverSubsystem(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClickSubsystem('battery');
        }}
      >
        <mesh material={batteryMaterial}>
          <boxGeometry args={[1.05, 0.7, 0.2]} />
        </mesh>
        {/* Battery LED Status Bar */}
        <mesh position={[0, 0.22, 0.11]}>
          <boxGeometry args={[0.85, 0.07, 0.02]} />
          <meshStandardMaterial
            color={isBatteryFault ? '#EF4444' : '#22C55E'}
            emissive={isBatteryFault ? '#EF4444' : '#22C55E'}
            emissiveIntensity={1.0}
          />
        </mesh>
      </group>

      {/* 4. ANTENNA & COMMUNICATION DISH */}
      <group
        position={[-0.3, 1.45, 0.35]}
        rotation={[0.35, 0.45, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverSubsystem('antenna');
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverSubsystem(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClickSubsystem('antenna');
        }}
      >
        {/* Steerable Gimbal Pedestal */}
        <mesh position={[0, -0.2, 0]} material={darkDeckMaterial}>
          <cylinderGeometry args={[0.1, 0.14, 0.25, 16]} />
        </mesh>
        {/* Parabolic Dish */}
        <mesh rotation={[Math.PI / 2, 0, 0]} material={antennaMaterial}>
          <coneGeometry args={[0.62, 0.28, 32, 1, true]} />
        </mesh>
        {/* Feed Horn Strut */}
        <mesh position={[0, 0, 0.32]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.055, 0.14, 12]} />
          <meshStandardMaterial color="#38BDF8" emissive="#38BDF8" emissiveIntensity={0.8} />
        </mesh>
        <mesh position={[0, 0, 0.16]} rotation={[Math.PI / 2, 0, 0]} material={titaniumStrutMaterial}>
          <cylinderGeometry args={[0.015, 0.015, 0.32, 8]} />
        </mesh>
      </group>

      {/* 5. REACTION WHEEL ASSEMBLY */}
      <group
        ref={reactionWheelRef}
        position={[0, -0.92, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverSubsystem('wheel');
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverSubsystem(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClickSubsystem('wheel');
        }}
      >
        {/* Housing Base */}
        <mesh material={wheelMaterial}>
          <cylinderGeometry args={[0.55, 0.55, 0.32, 24]} />
        </mesh>
        {/* Flywheels */}
        <mesh position={[0.22, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.22, 0.22, 0.12, 16]} />
          <meshStandardMaterial color="#38BDF8" metalness={0.9} roughness={0.15} />
        </mesh>
        <mesh position={[-0.22, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.22, 0.22, 0.12, 16]} />
          <meshStandardMaterial color="#38BDF8" metalness={0.9} roughness={0.15} />
        </mesh>
      </group>

      {/* 6. THERMAL RADIATOR LOUVERS */}
      <group
        position={[0, 0.4, -0.88]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverSubsystem('thermal');
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverSubsystem(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClickSubsystem('thermal');
        }}
      >
        <mesh material={thermalMaterial}>
          <boxGeometry args={[1.25, 0.95, 0.1]} />
        </mesh>
        {[-0.32, -0.11, 0.11, 0.32].map((sy) => (
          <mesh key={`slat-${sy}`} position={[0, sy, -0.06]} rotation={[0.35, 0, 0]}>
            <boxGeometry args={[1.15, 0.08, 0.04]} />
            <meshStandardMaterial color="#A855F7" metalness={0.8} roughness={0.25} />
          </mesh>
        ))}
      </group>

      {/* 7. ATTITUDE COORDINATE AXES INDICATORS */}
      <group position={[0, -1.25, 0]}>
        <mesh position={[0.45, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.015, 0.015, 0.9, 8]} />
          <meshBasicMaterial color="#EF4444" />
        </mesh>
        <mesh position={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.9, 8]} />
          <meshBasicMaterial color="#22C55E" />
        </mesh>
        <mesh position={[0, 0, 0.45]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.9, 8]} />
          <meshBasicMaterial color="#38BDF8" />
        </mesh>
      </group>
    </group>
  );
}

export default function SpacecraftScene({
  selectedSubsystem,
  hoveredSubsystem,
  onHoverSubsystem,
  onClickSubsystem,
  faultState = {},
  isPaused = false
}) {
  const controlsRef = useRef(null);
  const [viewMode, setViewMode] = useState('3D');

  const handleResetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
      controlsRef.current.object.position.set(4.5, 3.2, 5.5);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  const handleToggleView = () => {
    if (controlsRef.current) {
      if (viewMode === '3D') {
        controlsRef.current.object.position.set(0, 7.5, 0.01);
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
        setViewMode('TOP');
      } else {
        controlsRef.current.object.position.set(4.5, 3.2, 5.5);
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
        setViewMode('3D');
      }
    }
  };

  return (
    <div className="spacecraft-scene-wrapper">
      {/* Camera Controls Hint Card (Top Left of Viewport) */}
      <div className="camera-controls-hud-card">
        <span className="camera-hud-title">CAMERA CONTROLS</span>
        <div className="camera-hud-item">
          <Rotate3d size={12} className="text-cyan" />
          <span>Drag Rotate</span>
        </div>
        <div className="camera-hud-item">
          <Search size={12} className="text-cyan" />
          <span>Scroll Zoom</span>
        </div>
        <div className="camera-hud-item">
          <RotateCcw size={12} className="text-cyan" />
          <span>Double Click Reset</span>
        </div>
      </div>

      <Canvas
        camera={{ position: [4.5, 3.2, 5.5], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        onDoubleClick={handleResetCamera}
        className="spacecraft-canvas"
      >
        <CameraController controlsRef={controlsRef} />

        {/* Lighting setup: Solar key light, Earth cool ambient, Deep Space blue fill */}
        <ambientLight intensity={0.45} color="#A7C7E7" />
        <directionalLight
          position={[8, 10, 6]}
          intensity={2.4}
          color="#FFF9EA"
          castShadow
        />
        <directionalLight
          position={[-6, -4, -4]}
          intensity={0.65}
          color="#38BDF8"
        />
        <pointLight position={[0, -5, 0]} intensity={0.8} color="#0284C7" />

        {/* Deep Space Starfield & Earth Environment */}
        <Starfield count={1600} />
        <EarthEnvironment />

        {/* Interactive Digital Twin Spacecraft */}
        <Spacecraft
          selectedSubsystem={selectedSubsystem}
          hoveredSubsystem={hoveredSubsystem}
          onHoverSubsystem={onHoverSubsystem}
          onClickSubsystem={onClickSubsystem}
          faultState={faultState}
          isPaused={isPaused}
        />
      </Canvas>

      {/* Floating 3D Viewport Action Buttons */}
      <div className="viewport-action-buttons">
        <button
          type="button"
          className={`viewport-btn ${viewMode === '3D' ? 'active' : ''}`}
          onClick={handleToggleView}
          title="Toggle 3D View Angle"
        >
          <Rotate3d size={14} className="vp-icon" />
          <span>{viewMode === '3D' ? '3D View' : 'Top View'}</span>
        </button>
        <button
          type="button"
          className="viewport-btn"
          onClick={handleResetCamera}
          title="Reset Camera View"
        >
          <RefreshCw size={14} className="vp-icon" />
          <span>Reset View</span>
        </button>
      </div>
    </div>
  );
}
