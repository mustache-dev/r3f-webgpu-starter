import { createRoot } from "react-dom/client";
import { useState, useCallback, useRef, useEffect, createContext, useContext } from "react";
import { Appearance, Blending, EmitterShape, Lighting } from "./VFXParticles";
import * as THREE from "three";

// Context to share flush function with input components
const DebugPanelContext = createContext(null);

// Geometry types for the debug panel
export const GeometryType = Object.freeze({
  NONE: "none",           // Sprite mode (no geometry)
  BOX: "box",
  SPHERE: "sphere",
  CYLINDER: "cylinder",
  CONE: "cone",
  TORUS: "torus",
  PLANE: "plane",
  CIRCLE: "circle",
  RING: "ring",
  DODECAHEDRON: "dodecahedron",
  ICOSAHEDRON: "icosahedron",
  OCTAHEDRON: "octahedron",
  TETRAHEDRON: "tetrahedron",
  CAPSULE: "capsule",
});

// Default arguments for each geometry type
const geometryDefaults = {
  [GeometryType.BOX]: { width: 1, height: 1, depth: 1, widthSegments: 1, heightSegments: 1, depthSegments: 1 },
  [GeometryType.SPHERE]: { radius: 0.5, widthSegments: 16, heightSegments: 12 },
  [GeometryType.CYLINDER]: { radiusTop: 0.5, radiusBottom: 0.5, height: 1, radialSegments: 16, heightSegments: 1 },
  [GeometryType.CONE]: { radius: 0.5, height: 1, radialSegments: 16, heightSegments: 1 },
  [GeometryType.TORUS]: { radius: 0.5, tube: 0.2, radialSegments: 12, tubularSegments: 24 },
  [GeometryType.PLANE]: { width: 1, height: 1, widthSegments: 1, heightSegments: 1 },
  [GeometryType.CIRCLE]: { radius: 0.5, segments: 16 },
  [GeometryType.RING]: { innerRadius: 0.25, outerRadius: 0.5, thetaSegments: 16 },
  [GeometryType.DODECAHEDRON]: { radius: 0.5, detail: 0 },
  [GeometryType.ICOSAHEDRON]: { radius: 0.5, detail: 0 },
  [GeometryType.OCTAHEDRON]: { radius: 0.5, detail: 0 },
  [GeometryType.TETRAHEDRON]: { radius: 0.5, detail: 0 },
  [GeometryType.CAPSULE]: { radius: 0.25, length: 0.5, capSegments: 4, radialSegments: 8 },
};

// Create geometry from type and args
export const createGeometry = (type, args = {}) => {
  if (type === GeometryType.NONE || !type) return null;
  
  const defaults = geometryDefaults[type] || {};
  const mergedArgs = { ...defaults, ...args };
  
  switch (type) {
    case GeometryType.BOX:
      return new THREE.BoxGeometry(
        mergedArgs.width, mergedArgs.height, mergedArgs.depth,
        mergedArgs.widthSegments, mergedArgs.heightSegments, mergedArgs.depthSegments
      );
    case GeometryType.SPHERE:
      return new THREE.SphereGeometry(mergedArgs.radius, mergedArgs.widthSegments, mergedArgs.heightSegments);
    case GeometryType.CYLINDER:
      return new THREE.CylinderGeometry(
        mergedArgs.radiusTop, mergedArgs.radiusBottom, mergedArgs.height,
        mergedArgs.radialSegments, mergedArgs.heightSegments
      );
    case GeometryType.CONE:
      return new THREE.ConeGeometry(mergedArgs.radius, mergedArgs.height, mergedArgs.radialSegments, mergedArgs.heightSegments);
    case GeometryType.TORUS:
      return new THREE.TorusGeometry(mergedArgs.radius, mergedArgs.tube, mergedArgs.radialSegments, mergedArgs.tubularSegments);
    case GeometryType.PLANE:
      return new THREE.PlaneGeometry(mergedArgs.width, mergedArgs.height, mergedArgs.widthSegments, mergedArgs.heightSegments);
    case GeometryType.CIRCLE:
      return new THREE.CircleGeometry(mergedArgs.radius, mergedArgs.segments);
    case GeometryType.RING:
      return new THREE.RingGeometry(mergedArgs.innerRadius, mergedArgs.outerRadius, mergedArgs.thetaSegments);
    case GeometryType.DODECAHEDRON:
      return new THREE.DodecahedronGeometry(mergedArgs.radius, mergedArgs.detail);
    case GeometryType.ICOSAHEDRON:
      return new THREE.IcosahedronGeometry(mergedArgs.radius, mergedArgs.detail);
    case GeometryType.OCTAHEDRON:
      return new THREE.OctahedronGeometry(mergedArgs.radius, mergedArgs.detail);
    case GeometryType.TETRAHEDRON:
      return new THREE.TetrahedronGeometry(mergedArgs.radius, mergedArgs.detail);
    case GeometryType.CAPSULE:
      return new THREE.CapsuleGeometry(mergedArgs.radius, mergedArgs.length, mergedArgs.capSegments, mergedArgs.radialSegments);
    default:
      return null;
  }
};

// Global state for the debug panel
let debugRoot = null;
let debugContainer = null;
let currentValues = null;
let currentOnChange = null;

// ray.so "wrapped" theme - warm amber glow on dark glass
const wrapped = {
  // Core backgrounds
  bg: "rgba(10, 10, 12, 0.92)",
  bgPanel: "rgba(18, 18, 22, 0.85)",
  bgSection: "rgba(25, 25, 30, 0.7)",
  bgInput: "rgba(0, 0, 0, 0.4)",
  
  // Warm amber/orange accent (the signature wrapped glow)
  accent: "#f97316",
  accentLight: "#fb923c",
  accentGlow: "rgba(249, 115, 22, 0.5)",
  accentSoft: "rgba(249, 115, 22, 0.15)",
  
  // Borders with soft warm light
  border: "rgba(255, 255, 255, 0.08)",
  borderLit: "rgba(251, 146, 60, 0.3)",
  borderGlow: "rgba(249, 115, 22, 0.2)",
  
  // Text colors
  text: "rgba(255, 255, 255, 0.95)",
  textMuted: "rgba(255, 255, 255, 0.5)",
  textDim: "rgba(255, 255, 255, 0.3)",
  textAccent: "#fdba74",
  
  // Soft fading grid background (fades from bottom to top)
  gridBg: `
    linear-gradient(to top, rgba(10, 10, 12, 0) 0%, rgba(10, 10, 12, 0.95) 100%),
    linear-gradient(rgba(249, 115, 22, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(249, 115, 22, 0.03) 1px, transparent 1px)
  `,
  gridSize: "24px 24px",
  
  // Shadow with warm undertone
  shadow: "0 30px 60px -15px rgba(0, 0, 0, 0.7), 0 0 1px rgba(251, 146, 60, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
};

// Helper to format value for JSX output
const formatJSXValue = (key, value) => {
  if (value === undefined || value === null) return null;
  
  // Booleans
  if (typeof value === "boolean") {
    return value ? `${key}={true}` : `${key}={false}`;
  }
  
  // Numbers
  if (typeof value === "number") {
    return `${key}={${value}}`;
  }
  
  // Strings
  if (typeof value === "string") {
    // Check if it's a color
    if (value.startsWith("#") || value.startsWith("rgb")) {
      return `${key}="${value}"`;
    }
    return `${key}="${value}"`;
  }
  
  // Arrays
  if (Array.isArray(value)) {
    // Check if it's an array of colors (strings starting with #)
    if (value.length > 0 && typeof value[0] === "string" && value[0].startsWith("#")) {
      return `${key}={[${value.map(v => `"${v}"`).join(", ")}]}`;
    }
    // Check if it's a 2D array (like direction [[min, max], [min, max], [min, max]])
    if (value.length > 0 && Array.isArray(value[0])) {
      return `${key}={[${value.map(v => `[${v.join(", ")}]`).join(", ")}]}`;
    }
    // Simple array of numbers
    return `${key}={[${value.join(", ")}]}`;
  }
  
  // Objects
  if (typeof value === "object") {
    const formatObject = (obj, indent = 2) => {
      const entries = Object.entries(obj).filter(([, v]) => v !== undefined && v !== null);
      if (entries.length === 0) return "{}";
      
      const lines = entries.map(([k, v]) => {
        if (typeof v === "object" && !Array.isArray(v)) {
          return `${" ".repeat(indent)}${k}: ${formatObject(v, indent + 2)}`;
        }
        if (typeof v === "string") {
          return `${" ".repeat(indent)}${k}: "${v}"`;
        }
        return `${" ".repeat(indent)}${k}: ${v}`;
      });
      return `{\n${lines.join(",\n")}\n${" ".repeat(indent - 2)}}`;
    };
    return `${key}={${formatObject(value, 4)}}`;
  }
  
  return null;
};

// Map geometry type to Three.js constructor call
const geometryTypeToJSX = (type, args) => {
  if (!type || type === GeometryType.NONE) return null;
  
  const defaults = geometryDefaults[type] || {};
  const mergedArgs = { ...defaults, ...args };
  
  const formatArgs = (argNames) => {
    return argNames.map(name => mergedArgs[name]).join(", ");
  };
  
  switch (type) {
    case GeometryType.BOX:
      return `new BoxGeometry(${formatArgs(["width", "height", "depth", "widthSegments", "heightSegments", "depthSegments"])})`;
    case GeometryType.SPHERE:
      return `new SphereGeometry(${formatArgs(["radius", "widthSegments", "heightSegments"])})`;
    case GeometryType.CYLINDER:
      return `new CylinderGeometry(${formatArgs(["radiusTop", "radiusBottom", "height", "radialSegments", "heightSegments"])})`;
    case GeometryType.CONE:
      return `new ConeGeometry(${formatArgs(["radius", "height", "radialSegments", "heightSegments"])})`;
    case GeometryType.TORUS:
      return `new TorusGeometry(${formatArgs(["radius", "tube", "radialSegments", "tubularSegments"])})`;
    case GeometryType.PLANE:
      return `new PlaneGeometry(${formatArgs(["width", "height", "widthSegments", "heightSegments"])})`;
    case GeometryType.CIRCLE:
      return `new CircleGeometry(${formatArgs(["radius", "segments"])})`;
    case GeometryType.RING:
      return `new RingGeometry(${formatArgs(["innerRadius", "outerRadius", "thetaSegments"])})`;
    case GeometryType.DODECAHEDRON:
      return `new DodecahedronGeometry(${formatArgs(["radius", "detail"])})`;
    case GeometryType.ICOSAHEDRON:
      return `new IcosahedronGeometry(${formatArgs(["radius", "detail"])})`;
    case GeometryType.OCTAHEDRON:
      return `new OctahedronGeometry(${formatArgs(["radius", "detail"])})`;
    case GeometryType.TETRAHEDRON:
      return `new TetrahedronGeometry(${formatArgs(["radius", "detail"])})`;
    case GeometryType.CAPSULE:
      return `new CapsuleGeometry(${formatArgs(["radius", "length", "capSegments", "radialSegments"])})`;
    default:
      return null;
  }
};

// Generate full JSX string from values
const generateVFXParticlesJSX = (values) => {
  const props = [];
  
  // Define prop order for clean output
  const propOrder = [
    "maxParticles", "position", "autoStart", "emitCount", "delay", "intensity",
    "size", "fadeSize", "colorStart", "colorEnd", "fadeOpacity",
    "gravity", "speed", "lifetime", "friction",
    "direction", "startPosition",
    "rotation", "rotationSpeed", "orientToDirection",
    "appearance", "blending", "lighting", "shadow",
    "emitterShape", "emitterRadius", "emitterAngle", "emitterHeight", "emitterDirection", "emitterSurfaceOnly",
    "turbulence", "collision", "softParticles", "softDistance", "attractToCenter"
  ];
  
  // Handle geometry specially
  if (values.geometryType && values.geometryType !== GeometryType.NONE) {
    const geoJsx = geometryTypeToJSX(values.geometryType, values.geometryArgs);
    if (geoJsx) {
      props.push(`geometry={${geoJsx}}`);
    }
  }
  
  for (const key of propOrder) {
    const value = values[key];
    if (value === undefined || value === null) continue;
    
    // Skip default values
    if (key === "maxParticles" && value === 10000) continue;
    if (key === "autoStart" && value === true) continue;
    if (key === "emitCount" && value === 1) continue;
    if (key === "delay" && value === 0) continue;
    if (key === "intensity" && value === 1) continue;
    if (key === "shadow" && value === false) continue;
    if (key === "orientToDirection" && value === false) continue;
    if (key === "softParticles" && value === false) continue;
    if (key === "attractToCenter" && value === false) continue;
    if (key === "emitterSurfaceOnly" && value === false) continue;
    
    // Skip softDistance if softParticles is false
    if (key === "softDistance" && !values.softParticles) continue;
    
    const formatted = formatJSXValue(key, value);
    if (formatted) props.push(formatted);
  }
  
  if (props.length === 0) {
    return "<VFXParticles />";
  }
  
  return `<VFXParticles\n  ${props.join("\n  ")}\n/>`;
};

// Styles for the debug panel - ray.so wrapped theme
const styles = {
  container: {
    position: "fixed",
    top: "16px",
    right: "16px",
    bottom: "16px",
    minWidth: "300px",
    background: wrapped.bg,
    borderRadius: "12px",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', monospace",
    fontSize: "12px",
    color: wrapped.text,
    boxShadow: wrapped.shadow,
    zIndex: 99999,
    backdropFilter: "blur(40px) saturate(150%)",
    WebkitBackdropFilter: "blur(40px) saturate(150%)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    border: `1px solid ${wrapped.border}`,
    transition: "border-color 0.3s ease",
  },
  resizeHandle: {
    position: "absolute",
    bottom: "0",
    left: "0",
    width: "12px",
    height: "12px",
    cursor: "sw-resize",
    background: `linear-gradient(135deg, transparent 50%, ${wrapped.accentLight} 50%)`,
    borderRadius: "0 0 0 12px",
    opacity: 0.5,
  },
  resizeHandleRight: {
    position: "absolute",
    top: "48px",
    left: "0",
    width: "6px",
    height: "calc(100% - 58px)",
    cursor: "ew-resize",
    background: "transparent",
  },
  resizeHandleBottom: {
    position: "absolute",
    bottom: "0",
    left: "12px",
    right: "12px",
    height: "6px",
    cursor: "ns-resize",
    background: "transparent",
  },
  header: {
    padding: "10px 14px",
    background: "transparent",
    borderBottom: `1px solid ${wrapped.border}`,
    fontWeight: "400",
    fontSize: "11px",
    color: wrapped.textMuted,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    letterSpacing: "0.02em",
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  headerDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: wrapped.accent,
    boxShadow: `0 0 8px ${wrapped.accentGlow}`,
    animation: "dotPulse 2s ease-in-out infinite",
  },
  content: {
    padding: "8px",
    overflowY: "auto",
    flex: 1,
    scrollbarWidth: "thin",
    scrollbarColor: `${wrapped.accent} transparent`,
    background: wrapped.gridBg,
    backgroundSize: `100% 100%, ${wrapped.gridSize}, ${wrapped.gridSize}`,
  },
  section: {
    marginBottom: "4px",
    background: wrapped.bgSection,
    borderRadius: "8px",
    overflow: "hidden",
    border: `1px solid ${wrapped.border}`,
    transition: "all 0.25s ease",
    position: "relative",
  },
  sectionHover: {
    borderColor: "transparent",
    background: `linear-gradient(${wrapped.bgSection}, ${wrapped.bgSection}) padding-box, linear-gradient(135deg, ${wrapped.accent} 0%, ${wrapped.accentLight} 50%, rgba(251, 191, 36, 0.6) 100%) border-box`,
  },
  sectionHeader: {
    padding: "10px 12px",
    background: "rgba(255, 255, 255, 0.02)",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontWeight: "500",
    fontSize: "11px",
    letterSpacing: "0.03em",
    transition: "all 0.2s ease",
    userSelect: "none",
    color: wrapped.text,
  },
  sectionContent: {
    padding: "10px 12px",
    background: "rgba(0, 0, 0, 0.15)",
  },
  row: {
    marginBottom: "8px",
  },
  label: {
    display: "block",
    marginBottom: "5px",
    color: wrapped.textMuted,
    fontSize: "10px",
    fontWeight: "500",
    textTransform: "lowercase",
    letterSpacing: "0.04em",
  },
  input: {
    width: "100%",
    padding: "7px 10px",
    background: wrapped.bgInput,
    border: `1px solid ${wrapped.border}`,
    borderRadius: "6px",
    color: wrapped.text,
    fontSize: "12px",
    fontFamily: "inherit",
    outline: "none",
    transition: "all 0.2s ease",
    boxSizing: "border-box",
  },
  rangeRow: {
    display: "flex",
    gap: "6px",
    alignItems: "center",
  },
  rangeInput: {
    flex: 1,
    padding: "7px 10px",
    background: wrapped.bgInput,
    border: `1px solid ${wrapped.border}`,
    borderRadius: "6px",
    color: wrapped.text,
    fontSize: "12px",
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
    transition: "all 0.2s ease",
  },
  rangeSeparator: {
    color: wrapped.accent,
    fontSize: "11px",
    fontWeight: "600",
  },
  checkbox: {
    marginRight: "10px",
    accentColor: wrapped.accent,
    width: "13px",
    height: "13px",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
    padding: "5px 0",
    color: wrapped.text,
    fontSize: "11px",
  },
  select: {
    width: "100%",
    padding: "7px 10px",
    background: wrapped.bgInput,
    border: `1px solid ${wrapped.border}`,
    borderRadius: "6px",
    color: wrapped.text,
    fontSize: "12px",
    fontFamily: "inherit",
    outline: "none",
    cursor: "pointer",
    boxSizing: "border-box",
    transition: "all 0.2s ease",
  },
  colorInput: {
    width: "32px",
    height: "24px",
    padding: "2px",
    border: `1px solid ${wrapped.border}`,
    borderRadius: "4px",
    cursor: "pointer",
    background: wrapped.bgInput,
    transition: "all 0.2s ease",
  },
  colorRow: {
    display: "flex",
    gap: "5px",
    flexWrap: "wrap",
    alignItems: "center",
  },
  addColorBtn: {
    width: "24px",
    height: "24px",
    background: "transparent",
    border: `1px dashed ${wrapped.textDim}`,
    borderRadius: "4px",
    color: wrapped.textMuted,
    cursor: "pointer",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s ease",
  },
  removeColorBtn: {
    position: "absolute",
    top: "-4px",
    right: "-4px",
    width: "14px",
    height: "14px",
    background: wrapped.accent,
    border: "none",
    borderRadius: "50%",
    color: "#000",
    cursor: "pointer",
    fontSize: "9px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    fontWeight: "bold",
    boxShadow: `0 2px 8px ${wrapped.accentGlow}`,
  },
  colorWrapper: {
    position: "relative",
  },
  vec3Row: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "5px",
  },
  vec3Input: {
    padding: "7px 5px",
    background: wrapped.bgInput,
    border: `1px solid ${wrapped.border}`,
    borderRadius: "6px",
    color: wrapped.text,
    fontSize: "11px",
    fontFamily: "inherit",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    textAlign: "center",
    transition: "all 0.2s ease",
  },
  vec3Label: {
    fontSize: "9px",
    color: wrapped.textDim,
    textAlign: "center",
    marginTop: "3px",
    fontWeight: "500",
    letterSpacing: "0.05em",
    textTransform: "lowercase",
  },
  optionalSection: {
    // Same as regular sections - no special styling
  },
  enableCheckbox: {
    marginBottom: "8px",
    paddingBottom: "8px",
    borderBottom: `1px solid ${wrapped.border}`,
  },
  minimizeBtn: {
    background: "transparent",
    border: `1px solid ${wrapped.border}`,
    color: wrapped.textMuted,
    cursor: "pointer",
    fontSize: "11px",
    padding: "4px 8px",
    borderRadius: "4px",
    transition: "all 0.2s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  headerButtons: {
    display: "flex",
    gap: "6px",
    alignItems: "center",
  },
  copyBtn: {
    background: `linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(251, 146, 60, 0.1) 100%)`,
    border: `1px solid ${wrapped.borderLit}`,
    color: wrapped.accent,
    cursor: "pointer",
    fontSize: "10px",
    padding: "4px 12px",
    borderRadius: "4px",
    transition: "all 0.2s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    minWidth: "70px",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    textTransform: "lowercase",
    boxShadow: `0 0 12px rgba(249, 115, 22, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)`,
    textShadow: `0 0 8px rgba(249, 115, 22, 0.5)`,
  },
  copyBtnHover: {
    background: `linear-gradient(135deg, rgba(249, 115, 22, 0.25) 0%, rgba(251, 146, 60, 0.15) 100%)`,
    borderColor: wrapped.accent,
    boxShadow: `0 0 20px rgba(249, 115, 22, 0.4), 0 0 40px rgba(249, 115, 22, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)`,
    color: wrapped.accentLight,
    textShadow: `0 0 12px rgba(249, 115, 22, 0.8)`,
  },
  copyBtnSuccess: {
    background: `linear-gradient(135deg, rgba(34, 197, 94, 0.25) 0%, rgba(34, 197, 94, 0.15) 100%)`,
    borderColor: "rgba(34, 197, 94, 0.6)",
    color: "#4ade80",
    boxShadow: `0 0 16px rgba(34, 197, 94, 0.4), 0 0 32px rgba(34, 197, 94, 0.2)`,
    textShadow: `0 0 8px rgba(34, 197, 94, 0.6)`,
  },
  inputDragging: {
    background: `rgba(249, 115, 22, 0.15) !important`,
    borderColor: `${wrapped.accent} !important`,
    boxShadow: `0 0 0 2px ${wrapped.accentGlow}, 0 0 12px rgba(249, 115, 22, 0.3)`,
    color: wrapped.accentLight,
  },
  arrow: {
    fontSize: "8px",
    transition: "transform 0.2s ease",
    color: wrapped.accent,
  },
};

// Helper to parse range values
const parseRange = (value, defaultVal = [0, 0]) => {
  if (value === undefined || value === null) return defaultVal;
  if (Array.isArray(value)) return value.length === 2 ? value : [value[0], value[0]];
  return [value, value];
};

// Helper to parse 3D rotation/direction values
const parse3D = (value) => {
  if (value === undefined || value === null) return [[0, 0], [0, 0], [0, 0]];
  if (typeof value === "number") return [[value, value], [value, value], [value, value]];
  if (Array.isArray(value)) {
    if (Array.isArray(value[0])) {
      return [
        parseRange(value[0], [0, 0]),
        parseRange(value[1], [0, 0]),
        parseRange(value[2], [0, 0]),
      ];
    }
    const range = parseRange(value, [0, 0]);
    return [range, range, range];
  }
  return [[0, 0], [0, 0], [0, 0]];
};

// Section component - uses local state only for UI collapse
const Section = ({ title, children, defaultOpen = true, optional = false, enabled, onToggleEnabled }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isHovered, setIsHovered] = useState(false);
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(defaultOpen ? 'auto' : 0);

  // Update height when opening/closing
  useEffect(() => {
    if (contentRef.current) {
      if (isOpen) {
        const height = contentRef.current.scrollHeight;
        setContentHeight(height);
        // After animation, set to auto for dynamic content
        const timer = setTimeout(() => setContentHeight('auto'), 250);
        return () => clearTimeout(timer);
      } else {
        // First set explicit height, then animate to 0
        const height = contentRef.current.scrollHeight;
        setContentHeight(height);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setContentHeight(0);
          });
        });
      }
    }
  }, [isOpen]);

  const sectionStyle = {
    ...styles.section,
    ...(optional ? styles.optionalSection : {}),
    ...(isHovered ? {
      border: "1px solid transparent",
      background: `linear-gradient(rgba(25, 25, 30, 0.9), rgba(25, 25, 30, 0.9)) padding-box, linear-gradient(135deg, rgba(249, 115, 22, 0.6) 0%, rgba(251, 146, 60, 0.4) 50%, rgba(253, 186, 116, 0.3) 100%) border-box`,
    } : {}),
  };

  const contentWrapperStyle = {
    height: contentHeight === 'auto' ? 'auto' : `${contentHeight}px`,
    overflow: 'hidden',
    transition: 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  };

  return (
    <div
      style={sectionStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        style={{
          ...styles.sectionHeader,
          background: isHovered ? "rgba(249, 115, 22, 0.06)" : "rgba(255, 255, 255, 0.02)",
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ color: isHovered ? wrapped.textAccent : wrapped.text }}>{title}</span>
        <span style={{ ...styles.arrow, transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
      </div>
      <div style={contentWrapperStyle}>
        <div ref={contentRef} style={styles.sectionContent}>
          {optional && (
            <div style={styles.enableCheckbox}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => onToggleEnabled(e.target.checked)}
                  style={styles.checkbox}
                />
                Enable {title}
              </label>
            </div>
          )}
          {(!optional || enabled) && children}
        </div>
      </div>
    </div>
  );
};

// Scrubber hook for drag-to-change values like Photoshop
const useScrubber = (value, onChange, step = 0.01, min, max) => {
  const isDraggingRef = useRef(false);
  const hasMoved = useRef(false);
  const startX = useRef(0);
  const startValue = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const ctx = useContext(DebugPanelContext);

  const handleMouseDown = useCallback((e) => {
    // Only start scrubbing on left click
    if (e.button !== 0) return;
    e.preventDefault();
    isDraggingRef.current = true;
    hasMoved.current = false;
    startX.current = e.clientX;
    startValue.current = value;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current) return;
      const delta = e.clientX - startX.current;
      
      // Only start scrubbing after moving a few pixels (dead zone)
      if (!hasMoved.current && Math.abs(delta) < 3) return;
      if (!hasMoved.current) {
        hasMoved.current = true;
        setIsDragging(true);
      }
      
      // Sensitivity: 1px = step * 0.5, hold shift for fine control
      const sensitivity = e.shiftKey ? 0.1 : 0.5;
      const change = delta * step * sensitivity;
      let newValue = startValue.current + change;
      
      // Clamp to min/max
      if (min !== undefined) newValue = Math.max(min, newValue);
      if (max !== undefined) newValue = Math.min(max, newValue);
      
      // Round to step precision
      const precision = step < 1 ? Math.ceil(-Math.log10(step)) : 0;
      newValue = parseFloat(newValue.toFixed(precision));
      
      onChange(newValue);
    };
    
    const handleMouseUp = () => {
      const wasDragging = hasMoved.current;
      isDraggingRef.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Flush pending changes when user lifts mouse after dragging
      if (wasDragging && ctx?.flushChanges) {
        ctx.flushChanges();
      }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [value, onChange, step, min, max, ctx]);

  return { handleMouseDown, hasMoved, isDragging };
};

// Scrubber input component for individual number fields
const ScrubInput = ({ value, onChange, min, max, step = 0.01, style, placeholder }) => {
  const inputRef = useRef(null);
  const [localValue, setLocalValue] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);
  const { handleMouseDown, hasMoved, isDragging } = useScrubber(value, onChange, step, min, max);
  
  // Sync local value with prop when not focused (e.g., from scrubbing)
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(String(value));
    }
  }, [value, isFocused]);
  
  const onMouseDown = useCallback((e) => {
    // If already focused, let normal input behavior happen (selecting text, etc.)
    if (document.activeElement === inputRef.current) return;
    
    handleMouseDown(e);
    
    // On mouseup, if we didn't drag, focus the input for typing
    const onMouseUp = () => {
      if (!hasMoved.current && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mouseup', onMouseUp);
  }, [handleMouseDown, hasMoved]);
  
  const inputStyle = {
    ...style,
    cursor: 'ew-resize',
    ...(isDragging ? {
      background: `rgba(249, 115, 22, 0.15)`,
      borderColor: wrapped.accent,
      boxShadow: `0 0 0 2px ${wrapped.accentGlow}, 0 0 12px rgba(249, 115, 22, 0.3)`,
      color: wrapped.accentLight,
    } : {}),
  };
  
  // Handle both comma and dot as decimal separators
  const handleChange = useCallback((e) => {
    const val = e.target.value.replace(',', '.');
    setLocalValue(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
  }, [onChange]);

  const handleKeyDown = useCallback((e) => {
    // Convert comma to dot for decimal input
    if (e.key === ',') {
      e.preventDefault();
      const input = e.target;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const currentValue = input.value;
      const newValue = currentValue.slice(0, start) + '.' + currentValue.slice(end);
      setLocalValue(newValue);
      // Need to set cursor position after React re-renders
      setTimeout(() => {
        input.setSelectionRange(start + 1, start + 1);
      }, 0);
      const parsed = parseFloat(newValue);
      if (!isNaN(parsed)) {
        onChange(parsed);
      }
    }
  }, [onChange]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    // On blur, sync back to the actual value
    setLocalValue(String(value));
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={localValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onMouseDown={onMouseDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={inputStyle}
      placeholder={placeholder}
      title="Drag to scrub, click to type"
    />
  );
};

// Input components - all call onChange immediately
const NumberInput = ({ label, value, onChange, min, max, step = 0.01 }) => {
  const { handleMouseDown } = useScrubber(value, onChange, step, min, max);
  
  return (
    <div style={styles.row}>
      <label 
        style={{ ...styles.label, cursor: 'ew-resize' }}
        onMouseDown={handleMouseDown}
        title="Drag to scrub value"
      >
        {label}
      </label>
      <ScrubInput
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        style={styles.input}
      />
    </div>
  );
};

const RangeInput = ({ label, value, onChange, min = -100, max = 100, step = 0.01 }) => {
  const [minVal, maxVal] = parseRange(value, [0, 0]);
  const { handleMouseDown } = useScrubber(minVal, (v) => onChange([v, maxVal]), step, min, max);
  
  return (
    <div style={styles.row}>
      <label 
        style={{ ...styles.label, cursor: 'ew-resize' }}
        onMouseDown={handleMouseDown}
        title="Drag to scrub min value"
      >
        {label}
      </label>
      <div style={styles.rangeRow}>
        <ScrubInput
          value={minVal}
          onChange={(v) => onChange([v, maxVal])}
          min={min}
          max={max}
          step={step}
          style={styles.rangeInput}
          placeholder="min"
        />
        <span style={styles.rangeSeparator}>→</span>
        <ScrubInput
          value={maxVal}
          onChange={(v) => onChange([minVal, v])}
          min={min}
          max={max}
          step={step}
          style={styles.rangeInput}
          placeholder="max"
        />
      </div>
    </div>
  );
};

const Vec3Input = ({ label, value, onChange }) => {
  const [x, y, z] = value || [0, 0, 0];
  const { handleMouseDown } = useScrubber(x, (v) => onChange([v, y, z]), 0.1);
  
  return (
    <div style={styles.row}>
      <label 
        style={{ ...styles.label, cursor: 'ew-resize' }}
        onMouseDown={handleMouseDown}
        title="Drag to scrub X value"
      >
        {label}
      </label>
      <div style={styles.vec3Row}>
        <div>
          <ScrubInput
            value={x}
            onChange={(v) => onChange([v, y, z])}
            step={0.1}
            style={styles.vec3Input}
          />
          <div style={styles.vec3Label}>X</div>
        </div>
        <div>
          <ScrubInput
            value={y}
            onChange={(v) => onChange([x, v, z])}
            step={0.1}
            style={styles.vec3Input}
          />
          <div style={styles.vec3Label}>Y</div>
        </div>
        <div>
          <ScrubInput
            value={z}
            onChange={(v) => onChange([x, y, v])}
            step={0.1}
            style={styles.vec3Input}
          />
          <div style={styles.vec3Label}>Z</div>
        </div>
      </div>
    </div>
  );
};

const Range3DInput = ({ label, value, onChange }) => {
  const parsed = parse3D(value);
  const update = (axis, idx, val) => {
    const newVal = parsed.map((r, i) => i === axis ? [idx === 0 ? val : r[0], idx === 1 ? val : r[1]] : [...r]);
    onChange(newVal);
  };
  const { handleMouseDown } = useScrubber(parsed[0][0], (v) => update(0, 0, v), 0.1);
  
  return (
    <div style={styles.row}>
      <label 
        style={{ ...styles.label, cursor: 'ew-resize' }}
        onMouseDown={handleMouseDown}
        title="Drag to scrub X min"
      >
        {label}
      </label>
      {["X", "Y", "Z"].map((axis, i) => (
        <div key={axis} style={{ ...styles.rangeRow, marginBottom: "4px" }}>
          <span 
            style={{ width: "16px", color: "#6b7280", fontSize: "10px", cursor: 'ew-resize' }}
            title={`Drag to scrub ${axis} min`}
          >
            {axis}
          </span>
          <ScrubInput
            value={parsed[i][0]}
            onChange={(v) => update(i, 0, v)}
            step={0.1}
            style={{ ...styles.rangeInput, flex: 1 }}
          />
          <span style={styles.rangeSeparator}>→</span>
          <ScrubInput
            value={parsed[i][1]}
            onChange={(v) => update(i, 1, v)}
            step={0.1}
            style={{ ...styles.rangeInput, flex: 1 }}
          />
        </div>
      ))}
    </div>
  );
};

const SelectInput = ({ label, value, onChange, options }) => (
  <div style={styles.row}>
    <label style={styles.label}>{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={styles.select}
    >
      {Object.entries(options).map(([key, val]) => (
        <option key={key} value={val}>
          {key}
        </option>
      ))}
    </select>
  </div>
);

const CheckboxInput = ({ label, value, onChange }) => (
  <div style={styles.row}>
    <label style={styles.checkboxLabel}>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        style={styles.checkbox}
      />
      {label}
    </label>
  </div>
);

// Custom Color Picker matching the UI theme
const CustomColorPicker = ({ color, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hexInput, setHexInput] = useState(color);
  const pickerRef = useRef(null);
  const gradientRef = useRef(null);
  const isDraggingGradient = useRef(false);
  const isDraggingHue = useRef(false);
  
  // Preset colors
  const presets = [
    "#ffffff", "#f97316", "#fb923c", "#fbbf24", "#facc15",
    "#a3e635", "#22c55e", "#14b8a6", "#06b6d4", "#0ea5e9",
    "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
    "#ec4899", "#f43f5e", "#ef4444", "#000000", "#888888",
  ];
  
  // Convert hex to HSV
  const hexToHsv = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: h * 360, s: s * 100, v: v * 100 };
  };
  
  // Convert HSV to hex
  const hsvToHex = (h, s, v) => {
    s /= 100; v /= 100;
    const i = Math.floor(h / 60) % 6;
    const f = h / 60 - Math.floor(h / 60);
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r, g, b;
    switch (i) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };
  
  const [hsv, setHsv] = useState(() => hexToHsv(color));
  
  // Sync when color prop changes
  useEffect(() => {
    if (!isOpen) {
      setHsv(hexToHsv(color));
      setHexInput(color);
    }
  }, [color, isOpen]);
  
  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        const newColor = hsvToHex(hsv.h, hsv.s, hsv.v);
        onChange(newColor);
        setIsOpen(false);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, hsv, onChange]);
  
  // Handle gradient area interaction
  const updateFromGradient = useCallback((e) => {
    if (!gradientRef.current) return;
    const rect = gradientRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const newHsv = { ...hsv, s: x * 100, v: (1 - y) * 100 };
    setHsv(newHsv);
    setHexInput(hsvToHex(newHsv.h, newHsv.s, newHsv.v));
  }, [hsv]);
  
  const handleGradientMouseDown = useCallback((e) => {
    e.preventDefault();
    isDraggingGradient.current = true;
    updateFromGradient(e);
    
    const handleMove = (e) => {
      if (isDraggingGradient.current) updateFromGradient(e);
    };
    const handleUp = () => {
      isDraggingGradient.current = false;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [updateFromGradient]);
  
  const handleHueChange = useCallback((e) => {
    const newH = parseFloat(e.target.value);
    const newHsv = { ...hsv, h: newH };
    setHsv(newHsv);
    setHexInput(hsvToHex(newHsv.h, newHsv.s, newHsv.v));
  }, [hsv]);
  
  const handleHexChange = useCallback((e) => {
    const val = e.target.value;
    setHexInput(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      setHsv(hexToHsv(val));
    }
  }, []);
  
  const handlePreset = useCallback((preset) => {
    setHsv(hexToHsv(preset));
    setHexInput(preset);
    onChange(preset);
    setIsOpen(false);
  }, [onChange]);
  
  const currentColor = hsvToHex(hsv.h, hsv.s, hsv.v);
  const hueColor = hsvToHex(hsv.h, 100, 100);
  
  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={pickerRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '28px',
          height: '22px',
          borderRadius: '4px',
          background: color,
          border: `1px solid ${wrapped.border}`,
          cursor: 'pointer',
          boxShadow: `0 0 8px ${color}50, inset 0 0 0 1px rgba(255,255,255,0.1)`,
          transition: 'all 0.15s ease',
        }}
        title={color}
      />
      {isOpen && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(12, 12, 14, 0.98)',
          backdropFilter: 'blur(20px)',
          border: `1px solid ${wrapped.borderLit}`,
          borderRadius: '12px',
          padding: '16px',
          zIndex: 10000,
          boxShadow: `0 25px 50px rgba(0, 0, 0, 0.6), 0 0 0 1px ${wrapped.accentGlow}20`,
          width: '240px',
        }}>
          {/* Saturation/Value gradient */}
          <div
            ref={gradientRef}
            onMouseDown={handleGradientMouseDown}
            style={{
              width: '100%',
              height: '150px',
              borderRadius: '6px',
              position: 'relative',
              cursor: 'crosshair',
              marginBottom: '12px',
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
              border: `1px solid ${wrapped.border}`,
            }}
          >
            {/* Marker */}
            <div style={{
              position: 'absolute',
              left: `${hsv.s}%`,
              top: `${100 - hsv.v}%`,
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              border: '2px solid white',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.4)',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              background: currentColor,
            }} />
          </div>
          
          {/* Hue slider */}
          <div style={{ marginBottom: '12px' }}>
            <input
              type="range"
              min="0"
              max="360"
              value={hsv.h}
              onChange={handleHueChange}
              style={{
                width: '100%',
                height: '14px',
                borderRadius: '7px',
                background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                cursor: 'pointer',
                WebkitAppearance: 'none',
              }}
            />
          </div>
          
          {/* Hex input and preview */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              background: currentColor,
              border: `1px solid ${wrapped.border}`,
              boxShadow: `0 0 12px ${currentColor}60`,
              flexShrink: 0,
            }} />
            <input
              type="text"
              value={hexInput}
              onChange={handleHexChange}
              onBlur={() => {
                if (/^#[0-9A-Fa-f]{6}$/.test(hexInput)) {
                  onChange(hexInput);
                }
              }}
              maxLength={7}
              style={{
                flex: 1,
                padding: '8px 10px',
                background: wrapped.bgInput,
                border: `1px solid ${wrapped.border}`,
                borderRadius: '6px',
                color: wrapped.text,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '12px',
                textAlign: 'center',
                textTransform: 'uppercase',
              }}
            />
          </div>
          
          {/* Presets */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(10, 1fr)',
            gap: '4px',
          }}>
            {presets.map((preset) => (
              <div
                key={preset}
                onClick={() => handlePreset(preset)}
                style={{
                  aspectRatio: '1',
                  borderRadius: '3px',
                  background: preset,
                  cursor: 'pointer',
                  border: `1px solid ${wrapped.border}`,
                  transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'scale(1.15)';
                  e.target.style.boxShadow = `0 0 8px ${preset}80`;
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'scale(1)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            ))}
          </div>
          
          {/* Close button */}
          <button
            onClick={() => {
              onChange(currentColor);
              setIsOpen(false);
            }}
            style={{
              width: '100%',
              marginTop: '12px',
              padding: '8px',
              background: `linear-gradient(135deg, ${wrapped.accentSoft} 0%, ${wrapped.accent}40 100%)`,
              border: `1px solid ${wrapped.borderLit}`,
              borderRadius: '6px',
              color: wrapped.accent,
              cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              textTransform: 'lowercase',
            }}
          >
            done
          </button>
        </div>
      )}
    </div>
  );
};

const ColorArrayInput = ({ label, value, onChange }) => {
  const colors = value || ["#ffffff"];
  const updateColor = (index, color) => {
    const newColors = [...colors];
    newColors[index] = color;
    onChange(newColors);
  };
  const addColor = () => {
    if (colors.length < 8) {
      onChange([...colors, "#ffffff"]);
    }
  };
  const removeColor = (index) => {
    if (colors.length > 1) {
      onChange(colors.filter((_, i) => i !== index));
    }
  };
  return (
    <div style={styles.row}>
      <label style={styles.label}>{label}</label>
      <div style={styles.colorRow}>
        {colors.map((color, i) => (
          <div key={i} style={styles.colorWrapper}>
            <CustomColorPicker
              color={color}
              onChange={(c) => updateColor(i, c)}
            />
            {colors.length > 1 && (
              <button onClick={() => removeColor(i)} style={styles.removeColorBtn}>
                ×
              </button>
            )}
          </div>
        ))}
        {colors.length < 8 && (
          <button onClick={addColor} style={styles.addColorBtn}>
            +
          </button>
        )}
      </div>
    </div>
  );
};

// Main Debug Panel Component - minimal React state, only for UI
// Circular loading spinner component
const LoadingSpinner = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    style={{
      animation: "spin 1s linear infinite",
    }}
  >
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="rgba(249, 115, 22, 0.3)"
      strokeWidth="3"
      fill="none"
    />
    <path
      d="M12 2a10 10 0 0 1 10 10"
      stroke="rgba(249, 115, 22, 1)"
      strokeWidth="3"
      fill="none"
      strokeLinecap="round"
    />
  </svg>
);

const DebugPanelContent = ({ initialValues, onUpdate }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [panelSize, setPanelSize] = useState({ width: 320, height: null }); // null = full height
  const [copySuccess, setCopySuccess] = useState(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const valuesRef = useRef(initialValues);
  const [, forceUpdate] = useState(0);
  const isResizing = useRef(false);
  const resizeType = useRef(null);
  const debounceTimerRef = useRef(null);
  const DEBOUNCE_DELAY = 500; // 0.5s

  // Flush pending changes to parent
  const flushChanges = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setHasPendingChanges(false);
    onUpdate(valuesRef.current);
  }, [onUpdate]);

  // Schedule a debounced update
  const scheduleUpdate = useCallback(() => {
    setHasPendingChanges(true);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      flushChanges();
    }, DEBOUNCE_DELAY);
  }, [flushChanges]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Copy JSX to clipboard
  const handleCopyJSX = useCallback(async () => {
    // Flush any pending changes first
    if (hasPendingChanges) {
      flushChanges();
    }
    const jsx = generateVFXParticlesJSX(valuesRef.current);
    try {
      await navigator.clipboard.writeText(jsx);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [hasPendingChanges, flushChanges]);

  const update = useCallback((key, value) => {
    valuesRef.current = { ...valuesRef.current, [key]: value };
    scheduleUpdate();
    forceUpdate(n => n + 1);
  }, [scheduleUpdate]);

  const updateNested = useCallback((parentKey, childKey, value) => {
    valuesRef.current = {
      ...valuesRef.current,
      [parentKey]: {
        ...valuesRef.current[parentKey],
        [childKey]: value,
      },
    };
    scheduleUpdate();
    forceUpdate(n => n + 1);
  }, [scheduleUpdate]);

  // Helper to update geometry args and trigger geometry recreation
  const updateGeometryArg = useCallback((key, value) => {
    const newArgs = {
      ...valuesRef.current.geometryArgs,
      [key]: value,
    };
    valuesRef.current = {
      ...valuesRef.current,
      geometryArgs: newArgs,
    };
    scheduleUpdate();
    forceUpdate(n => n + 1);
  }, [scheduleUpdate]);

  // Context value for child components
  const contextValue = { flushChanges };

  // Resize handlers
  const handleResizeStart = useCallback((e, type) => {
    e.preventDefault();
    isResizing.current = true;
    resizeType.current = type;
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = panelSize.width;
    // If height is null (full height), calculate current height from window
    const startHeight = panelSize.height || (window.innerHeight - 32);
    
    document.body.style.cursor = type === 'corner' ? 'sw-resize' : type === 'left' ? 'ew-resize' : 'ns-resize';
    document.body.style.userSelect = 'none';
    
    const handleMouseMove = (e) => {
      if (!isResizing.current) return;
      
      let newWidth = startWidth;
      let newHeight = startHeight;
      
      if (type === 'corner' || type === 'left') {
        // Dragging left edge - increase width when moving left
        newWidth = startWidth - (e.clientX - startX);
      }
      if (type === 'corner' || type === 'bottom') {
        newHeight = startHeight + (e.clientY - startY);
      }
      
      // Clamp dimensions
      newWidth = Math.max(280, Math.min(600, newWidth));
      newHeight = Math.max(200, Math.min(window.innerHeight - 32, newHeight));
      
      setPanelSize({ width: newWidth, height: newHeight });
    };
    
    const handleMouseUp = () => {
      isResizing.current = false;
      resizeType.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [panelSize]);

  const values = valuesRef.current;
  
  const containerStyle = {
    ...styles.container,
    width: `${panelSize.width}px`,
    height: isMinimized ? 'auto' : (panelSize.height ? `${panelSize.height}px` : undefined),
  };

  return (
    <DebugPanelContext.Provider value={contextValue}>
    <div style={containerStyle}>
      {/* Resize handles */}
      {!isMinimized && (
        <>
          <div 
            style={styles.resizeHandle} 
            onMouseDown={(e) => handleResizeStart(e, 'corner')}
            title="Drag to resize"
          />
          <div 
            style={styles.resizeHandleRight} 
            onMouseDown={(e) => handleResizeStart(e, 'left')}
          />
          <div 
            style={styles.resizeHandleBottom} 
            onMouseDown={(e) => handleResizeStart(e, 'bottom')}
          />
        </>
      )}
      
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <div style={styles.headerDot} />
          <span>particles</span>
        </div>
        <div style={styles.headerButtons}>
          {hasPendingChanges && <LoadingSpinner />}
          <button 
            style={{
              ...styles.copyBtn,
              ...(copySuccess ? styles.copyBtnSuccess : {})
            }} 
            onClick={handleCopyJSX}
            onMouseEnter={(e) => {
              if (!copySuccess) {
                Object.assign(e.currentTarget.style, {
                  background: `linear-gradient(135deg, rgba(249, 115, 22, 0.25) 0%, rgba(251, 146, 60, 0.15) 100%)`,
                  borderColor: wrapped.accent,
                  boxShadow: `0 0 20px rgba(249, 115, 22, 0.4), 0 0 40px rgba(249, 115, 22, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)`,
                  color: wrapped.accentLight,
                  textShadow: `0 0 12px rgba(249, 115, 22, 0.8)`,
                });
              }
            }}
            onMouseLeave={(e) => {
              if (!copySuccess) {
                Object.assign(e.currentTarget.style, {
                  background: `linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(251, 146, 60, 0.1) 100%)`,
                  borderColor: wrapped.borderLit,
                  boxShadow: `0 0 12px rgba(249, 115, 22, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)`,
                  color: wrapped.accent,
                  textShadow: `0 0 8px rgba(249, 115, 22, 0.5)`,
                });
              }
            }}
          >
            {copySuccess ? "✓ copied" : "copy jsx"}
          </button>
          <button style={styles.minimizeBtn} onClick={() => setIsMinimized(!isMinimized)}>
            {isMinimized ? "+" : "−"}
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div style={styles.content}>
          {/* Basic Settings */}
          <Section title="Basic" defaultOpen={true}>
            <NumberInput
              label="Max Particles"
              value={values.maxParticles || 10000}
              onChange={(v) => update("maxParticles", v)}
              min={1}
              max={100000}
              step={100}
            />
            <Vec3Input label="Position" value={values.position} onChange={(v) => update("position", v)} />
            <NumberInput
              label="Emit Count"
              value={values.emitCount || 1}
              onChange={(v) => update("emitCount", v)}
              min={1}
              max={1000}
              step={1}
            />
            <NumberInput
              label="Delay (s)"
              value={values.delay || 0}
              onChange={(v) => update("delay", v)}
              min={0}
              max={10}
              step={0.01}
            />
            <CheckboxInput label="Auto Start" value={values.autoStart} onChange={(v) => update("autoStart", v)} />
          </Section>

          {/* Size */}
          <Section title="Size" defaultOpen={false}>
            <RangeInput
              label="Size Range"
              value={values.size}
              onChange={(v) => update("size", v)}
              min={0}
              max={10}
            />
            <RangeInput
              label="Fade Size (start → end)"
              value={values.fadeSize}
              onChange={(v) => update("fadeSize", v)}
              min={0}
              max={5}
            />
          </Section>

          {/* Colors */}
          <Section title="Colors" defaultOpen={false}>
            <ColorArrayInput
              label="Start Colors"
              value={values.colorStart}
              onChange={(v) => update("colorStart", v)}
            />
            <div style={styles.row}>
              <label style={styles.label}>End Colors</label>
              <input
                type="checkbox"
                checked={!!values.colorEnd}
                onChange={(e) => update("colorEnd", e.target.checked ? ["#ffffff"] : null)}
                style={{ accentColor: wrapped.accent }}
              />
            </div>
            {values.colorEnd && (
              <ColorArrayInput
                label=""
                value={values.colorEnd}
                onChange={(v) => update("colorEnd", v)}
              />
            )}
            <RangeInput
              label="Fade Opacity (start → end)"
              value={values.fadeOpacity}
              onChange={(v) => update("fadeOpacity", v)}
              min={0}
              max={1}
            />
            <NumberInput
              label="Intensity"
              value={values.intensity || 1}
              onChange={(v) => update("intensity", v)}
              min={0}
              max={50}
              step={0.1}
            />
          </Section>

          {/* Physics */}
          <Section title="Physics" defaultOpen={false}>
            <Vec3Input label="Gravity" value={values.gravity} onChange={(v) => update("gravity", v)} />
            <RangeInput
              label="Speed Range"
              value={values.speed}
              onChange={(v) => update("speed", v)}
              min={0}
              max={10}
            />
            <RangeInput
              label="Lifetime (s)"
              value={values.lifetime}
              onChange={(v) => update("lifetime", v)}
              min={0.1}
              max={60}
            />
            <RangeInput
              label="Friction Intensity"
              value={values.friction?.intensity}
              onChange={(v) => updateNested("friction", "intensity", v)}
              min={-1}
              max={1}
            />
            <SelectInput
              label="Friction Easing"
              value={values.friction?.easing || "linear"}
              onChange={(v) => updateNested("friction", "easing", v)}
              options={{ Linear: "linear", "Ease In": "easeIn", "Ease Out": "easeOut", "Ease In-Out": "easeInOut" }}
            />
          </Section>

          {/* Direction & Position */}
          <Section title="Direction & Start Position" defaultOpen={false}>
            <Range3DInput label="Direction (XYZ ranges)" value={values.direction} onChange={(v) => update("direction", v)} />
            <Range3DInput
              label="Start Position Offset (XYZ)"
              value={values.startPosition}
              onChange={(v) => update("startPosition", v)}
            />
          </Section>

          {/* Rotation */}
          <Section title="Rotation" defaultOpen={false}>
            <Range3DInput label="Rotation (rad)" value={values.rotation} onChange={(v) => update("rotation", v)} />
            <Range3DInput
              label="Rotation Speed (rad/s)"
              value={values.rotationSpeed}
              onChange={(v) => update("rotationSpeed", v)}
            />
            <CheckboxInput
              label="Orient to Direction"
              value={values.orientToDirection}
              onChange={(v) => update("orientToDirection", v)}
            />
          </Section>

          {/* Geometry */}
          <Section title="Geometry" defaultOpen={false}>
            <SelectInput
              label="Type"
              value={values.geometryType || GeometryType.NONE}
              onChange={(v) => {
                update("geometryType", v);
                // Reset geometry args to defaults when changing type
                if (v !== GeometryType.NONE) {
                  update("geometryArgs", { ...geometryDefaults[v] });
                } else {
                  update("geometryArgs", null);
                }
              }}
              options={{
                "None (Sprite)": GeometryType.NONE,
                Box: GeometryType.BOX,
                Sphere: GeometryType.SPHERE,
                Cylinder: GeometryType.CYLINDER,
                Cone: GeometryType.CONE,
                Torus: GeometryType.TORUS,
                Plane: GeometryType.PLANE,
                Circle: GeometryType.CIRCLE,
                Ring: GeometryType.RING,
                Dodecahedron: GeometryType.DODECAHEDRON,
                Icosahedron: GeometryType.ICOSAHEDRON,
                Octahedron: GeometryType.OCTAHEDRON,
                Tetrahedron: GeometryType.TETRAHEDRON,
                Capsule: GeometryType.CAPSULE,
              }}
            />
            {/* Box args */}
            {values.geometryType === GeometryType.BOX && (
              <>
                <NumberInput label="Width" value={values.geometryArgs?.width || 1} onChange={(v) => updateGeometryArg("width", v)} min={0.01} max={10} step={0.1} />
                <NumberInput label="Height" value={values.geometryArgs?.height || 1} onChange={(v) => updateGeometryArg("height", v)} min={0.01} max={10} step={0.1} />
                <NumberInput label="Depth" value={values.geometryArgs?.depth || 1} onChange={(v) => updateGeometryArg("depth", v)} min={0.01} max={10} step={0.1} />
                <NumberInput label="Width Segments" value={values.geometryArgs?.widthSegments || 1} onChange={(v) => updateGeometryArg("widthSegments", Math.floor(v))} min={1} max={32} step={1} />
                <NumberInput label="Height Segments" value={values.geometryArgs?.heightSegments || 1} onChange={(v) => updateGeometryArg("heightSegments", Math.floor(v))} min={1} max={32} step={1} />
                <NumberInput label="Depth Segments" value={values.geometryArgs?.depthSegments || 1} onChange={(v) => updateGeometryArg("depthSegments", Math.floor(v))} min={1} max={32} step={1} />
              </>
            )}
            {/* Sphere args */}
            {values.geometryType === GeometryType.SPHERE && (
              <>
                <NumberInput label="Radius" value={values.geometryArgs?.radius || 0.5} onChange={(v) => updateGeometryArg("radius", v)} min={0.01} max={10} step={0.1} />
                <NumberInput label="Width Segments" value={values.geometryArgs?.widthSegments || 16} onChange={(v) => updateGeometryArg("widthSegments", Math.floor(v))} min={3} max={64} step={1} />
                <NumberInput label="Height Segments" value={values.geometryArgs?.heightSegments || 12} onChange={(v) => updateGeometryArg("heightSegments", Math.floor(v))} min={2} max={64} step={1} />
              </>
            )}
            {/* Cylinder args */}
            {values.geometryType === GeometryType.CYLINDER && (
              <>
                <NumberInput label="Radius Top" value={values.geometryArgs?.radiusTop || 0.5} onChange={(v) => updateGeometryArg("radiusTop", v)} min={0} max={10} step={0.1} />
                <NumberInput label="Radius Bottom" value={values.geometryArgs?.radiusBottom || 0.5} onChange={(v) => updateGeometryArg("radiusBottom", v)} min={0} max={10} step={0.1} />
                <NumberInput label="Height" value={values.geometryArgs?.height || 1} onChange={(v) => updateGeometryArg("height", v)} min={0.01} max={10} step={0.1} />
                <NumberInput label="Radial Segments" value={values.geometryArgs?.radialSegments || 16} onChange={(v) => updateGeometryArg("radialSegments", Math.floor(v))} min={3} max={64} step={1} />
                <NumberInput label="Height Segments" value={values.geometryArgs?.heightSegments || 1} onChange={(v) => updateGeometryArg("heightSegments", Math.floor(v))} min={1} max={32} step={1} />
              </>
            )}
            {/* Cone args */}
            {values.geometryType === GeometryType.CONE && (
              <>
                <NumberInput label="Radius" value={values.geometryArgs?.radius || 0.5} onChange={(v) => updateGeometryArg("radius", v)} min={0.01} max={10} step={0.1} />
                <NumberInput label="Height" value={values.geometryArgs?.height || 1} onChange={(v) => updateGeometryArg("height", v)} min={0.01} max={10} step={0.1} />
                <NumberInput label="Radial Segments" value={values.geometryArgs?.radialSegments || 16} onChange={(v) => updateGeometryArg("radialSegments", Math.floor(v))} min={3} max={64} step={1} />
                <NumberInput label="Height Segments" value={values.geometryArgs?.heightSegments || 1} onChange={(v) => updateGeometryArg("heightSegments", Math.floor(v))} min={1} max={32} step={1} />
              </>
            )}
            {/* Torus args */}
            {values.geometryType === GeometryType.TORUS && (
              <>
                <NumberInput label="Radius" value={values.geometryArgs?.radius || 0.5} onChange={(v) => updateGeometryArg("radius", v)} min={0.01} max={10} step={0.1} />
                <NumberInput label="Tube" value={values.geometryArgs?.tube || 0.2} onChange={(v) => updateGeometryArg("tube", v)} min={0.01} max={5} step={0.05} />
                <NumberInput label="Radial Segments" value={values.geometryArgs?.radialSegments || 12} onChange={(v) => updateGeometryArg("radialSegments", Math.floor(v))} min={3} max={64} step={1} />
                <NumberInput label="Tubular Segments" value={values.geometryArgs?.tubularSegments || 24} onChange={(v) => updateGeometryArg("tubularSegments", Math.floor(v))} min={3} max={128} step={1} />
              </>
            )}
            {/* Plane args */}
            {values.geometryType === GeometryType.PLANE && (
              <>
                <NumberInput label="Width" value={values.geometryArgs?.width || 1} onChange={(v) => updateGeometryArg("width", v)} min={0.01} max={10} step={0.1} />
                <NumberInput label="Height" value={values.geometryArgs?.height || 1} onChange={(v) => updateGeometryArg("height", v)} min={0.01} max={10} step={0.1} />
                <NumberInput label="Width Segments" value={values.geometryArgs?.widthSegments || 1} onChange={(v) => updateGeometryArg("widthSegments", Math.floor(v))} min={1} max={32} step={1} />
                <NumberInput label="Height Segments" value={values.geometryArgs?.heightSegments || 1} onChange={(v) => updateGeometryArg("heightSegments", Math.floor(v))} min={1} max={32} step={1} />
              </>
            )}
            {/* Circle args */}
            {values.geometryType === GeometryType.CIRCLE && (
              <>
                <NumberInput label="Radius" value={values.geometryArgs?.radius || 0.5} onChange={(v) => updateGeometryArg("radius", v)} min={0.01} max={10} step={0.1} />
                <NumberInput label="Segments" value={values.geometryArgs?.segments || 16} onChange={(v) => updateGeometryArg("segments", Math.floor(v))} min={3} max={64} step={1} />
              </>
            )}
            {/* Ring args */}
            {values.geometryType === GeometryType.RING && (
              <>
                <NumberInput label="Inner Radius" value={values.geometryArgs?.innerRadius || 0.25} onChange={(v) => updateGeometryArg("innerRadius", v)} min={0} max={10} step={0.1} />
                <NumberInput label="Outer Radius" value={values.geometryArgs?.outerRadius || 0.5} onChange={(v) => updateGeometryArg("outerRadius", v)} min={0.01} max={10} step={0.1} />
                <NumberInput label="Theta Segments" value={values.geometryArgs?.thetaSegments || 16} onChange={(v) => updateGeometryArg("thetaSegments", Math.floor(v))} min={3} max={64} step={1} />
              </>
            )}
            {/* Polyhedra args (Dodecahedron, Icosahedron, Octahedron, Tetrahedron) */}
            {(values.geometryType === GeometryType.DODECAHEDRON || 
              values.geometryType === GeometryType.ICOSAHEDRON ||
              values.geometryType === GeometryType.OCTAHEDRON ||
              values.geometryType === GeometryType.TETRAHEDRON) && (
              <>
                <NumberInput label="Radius" value={values.geometryArgs?.radius || 0.5} onChange={(v) => updateGeometryArg("radius", v)} min={0.01} max={10} step={0.1} />
                <NumberInput label="Detail" value={values.geometryArgs?.detail || 0} onChange={(v) => updateGeometryArg("detail", Math.floor(v))} min={0} max={5} step={1} />
              </>
            )}
            {/* Capsule args */}
            {values.geometryType === GeometryType.CAPSULE && (
              <>
                <NumberInput label="Radius" value={values.geometryArgs?.radius || 0.25} onChange={(v) => updateGeometryArg("radius", v)} min={0.01} max={10} step={0.1} />
                <NumberInput label="Length" value={values.geometryArgs?.length || 0.5} onChange={(v) => updateGeometryArg("length", v)} min={0} max={10} step={0.1} />
                <NumberInput label="Cap Segments" value={values.geometryArgs?.capSegments || 4} onChange={(v) => updateGeometryArg("capSegments", Math.floor(v))} min={1} max={32} step={1} />
                <NumberInput label="Radial Segments" value={values.geometryArgs?.radialSegments || 8} onChange={(v) => updateGeometryArg("radialSegments", Math.floor(v))} min={3} max={64} step={1} />
              </>
            )}
          </Section>

          {/* Appearance */}
          <Section title="Appearance" defaultOpen={false}>
            <SelectInput
              label="Appearance"
              value={values.appearance || Appearance.GRADIENT}
              onChange={(v) => update("appearance", v)}
              options={Appearance}
            />
            <SelectInput
              label="Blending"
              value={values.blending || Blending.NORMAL}
              onChange={(v) => update("blending", parseInt(v))}
              options={{
                Normal: Blending.NORMAL,
                Additive: Blending.ADDITIVE,
                Multiply: Blending.MULTIPLY,
                Subtractive: Blending.SUBTRACTIVE,
              }}
            />
            <SelectInput
              label="Lighting"
              value={values.lighting || Lighting.STANDARD}
              onChange={(v) => update("lighting", v)}
              options={Lighting}
            />
            <CheckboxInput label="Shadow" value={values.shadow} onChange={(v) => update("shadow", v)} />
          </Section>

          {/* Emitter Shape */}
          <Section title="Emitter Shape" defaultOpen={false}>
            <SelectInput
              label="Shape"
              value={values.emitterShape || EmitterShape.BOX}
              onChange={(v) => update("emitterShape", parseInt(v))}
              options={{
                Point: EmitterShape.POINT,
                Box: EmitterShape.BOX,
                Sphere: EmitterShape.SPHERE,
                Cone: EmitterShape.CONE,
                Disk: EmitterShape.DISK,
                Edge: EmitterShape.EDGE,
              }}
            />
            <RangeInput
              label="Emitter Radius (inner → outer)"
              value={values.emitterRadius}
              onChange={(v) => update("emitterRadius", v)}
              min={0}
              max={10}
            />
            <NumberInput
              label="Emitter Angle (rad)"
              value={values.emitterAngle || Math.PI / 4}
              onChange={(v) => update("emitterAngle", v)}
              min={0}
              max={Math.PI}
              step={0.01}
            />
            <RangeInput
              label="Emitter Height"
              value={values.emitterHeight}
              onChange={(v) => update("emitterHeight", v)}
              min={0}
              max={10}
            />
            <Vec3Input
              label="Emitter Direction"
              value={values.emitterDirection}
              onChange={(v) => update("emitterDirection", v)}
            />
            <CheckboxInput
              label="Surface Only"
              value={values.emitterSurfaceOnly}
              onChange={(v) => update("emitterSurfaceOnly", v)}
            />
          </Section>

          {/* Turbulence (Optional) */}
          <Section
            title="Turbulence"
            defaultOpen={false}
            optional={true}
            enabled={!!values.turbulence}
            onToggleEnabled={(enabled) =>
              update("turbulence", enabled ? { intensity: 0.5, frequency: 1, speed: 1 } : null)
            }
          >
            <NumberInput
              label="Intensity"
              value={values.turbulence?.intensity || 0.5}
              onChange={(v) => updateNested("turbulence", "intensity", v)}
              min={0}
              max={5}
            />
            <NumberInput
              label="Frequency"
              value={values.turbulence?.frequency || 1}
              onChange={(v) => updateNested("turbulence", "frequency", v)}
              min={0.1}
              max={10}
            />
            <NumberInput
              label="Speed"
              value={values.turbulence?.speed || 1}
              onChange={(v) => updateNested("turbulence", "speed", v)}
              min={0}
              max={5}
            />
          </Section>

          {/* Collision (Optional) */}
          <Section
            title="Collision"
            defaultOpen={false}
            optional={true}
            enabled={!!values.collision}
            onToggleEnabled={(enabled) =>
              update(
                "collision",
                enabled ? { plane: { y: 0 }, bounce: 0.3, friction: 0.8, die: false, sizeBasedGravity: 0 } : null
              )
            }
          >
            <NumberInput
              label="Plane Y"
              value={values.collision?.plane?.y || 0}
              onChange={(v) =>
                update("collision", { ...values.collision, plane: { ...values.collision?.plane, y: v } })
              }
              min={-100}
              max={100}
            />
            <NumberInput
              label="Bounce"
              value={values.collision?.bounce || 0.3}
              onChange={(v) => updateNested("collision", "bounce", v)}
              min={0}
              max={1}
            />
            <NumberInput
              label="Friction"
              value={values.collision?.friction || 0.8}
              onChange={(v) => updateNested("collision", "friction", v)}
              min={0}
              max={1}
            />
            <NumberInput
              label="Size-Based Gravity"
              value={values.collision?.sizeBasedGravity || 0}
              onChange={(v) => updateNested("collision", "sizeBasedGravity", v)}
              min={0}
              max={10}
            />
            <CheckboxInput
              label="Die on Collision"
              value={values.collision?.die}
              onChange={(v) => updateNested("collision", "die", v)}
            />
          </Section>

          {/* Soft Particles (Optional) */}
          <Section
            title="Soft Particles"
            defaultOpen={false}
            optional={true}
            enabled={values.softParticles}
            onToggleEnabled={(enabled) => update("softParticles", enabled)}
          >
            <NumberInput
              label="Soft Distance"
              value={values.softDistance || 0.5}
              onChange={(v) => update("softDistance", v)}
              min={0.01}
              max={10}
            />
          </Section>

          {/* Attract to Center */}
          <Section title="Attract to Center" defaultOpen={false}>
            <CheckboxInput
              label="Attract to Center"
              value={values.attractToCenter}
              onChange={(v) => update("attractToCenter", v)}
            />
          </Section>
        </div>
      )}
    </div>
    </DebugPanelContext.Provider>
  );
};

// Exported functions for imperative rendering (outside R3F)
export function renderDebugPanel(values, onChange) {
  currentValues = values;
  currentOnChange = onChange;
  
  if (!debugContainer) {
    debugContainer = document.createElement("div");
    debugContainer.id = "vfx-debug-panel-root";
    document.body.appendChild(debugContainer);
    
    // Inject scrollbar and wrapped theme styles
    const styleId = "vfx-debug-scrollbar-styles";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
        
        @keyframes dotPulse {
          0%, 100% {
            box-shadow: 0 0 4px rgba(249, 115, 22, 0.4), 0 0 8px rgba(249, 115, 22, 0.2);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 8px rgba(249, 115, 22, 0.6), 0 0 16px rgba(249, 115, 22, 0.3), 0 0 24px rgba(249, 115, 22, 0.1);
            transform: scale(1.1);
          }
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        #vfx-debug-panel-root *::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        #vfx-debug-panel-root *::-webkit-scrollbar-track {
          background: transparent;
        }
        #vfx-debug-panel-root *::-webkit-scrollbar-thumb {
          background: rgba(249, 115, 22, 0.4);
          border-radius: 3px;
        }
        #vfx-debug-panel-root *::-webkit-scrollbar-thumb:hover {
          background: rgba(249, 115, 22, 0.6);
        }
        #vfx-debug-panel-root *::-webkit-scrollbar-corner {
          background: transparent;
        }
        #vfx-debug-panel-root input:focus,
        #vfx-debug-panel-root select:focus {
          border-color: rgba(249, 115, 22, 0.5) !important;
          box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15), 0 0 20px rgba(249, 115, 22, 0.1) !important;
        }
        #vfx-debug-panel-root input:hover,
        #vfx-debug-panel-root select:hover {
          border-color: rgba(255, 255, 255, 0.15);
        }
        #vfx-debug-panel-root input[type="color"] {
          cursor: pointer;
        }
        #vfx-debug-panel-root input[type="color"]:hover {
          transform: scale(1.08);
          box-shadow: 0 0 12px rgba(249, 115, 22, 0.3);
        }
        #vfx-debug-panel-root input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
        }
        #vfx-debug-panel-root input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid rgba(0, 0, 0, 0.3);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
          margin-top: -1px;
        }
        #vfx-debug-panel-root input[type="range"]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid rgba(0, 0, 0, 0.3);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }
        #vfx-debug-panel-root button:hover {
          background: rgba(249, 115, 22, 0.1) !important;
          border-color: rgba(249, 115, 22, 0.3) !important;
          color: #fb923c !important;
        }
        #vfx-debug-panel-root select option {
          background: rgb(18, 18, 22);
          color: rgba(255, 255, 255, 0.95);
        }
        #vfx-debug-panel-root input[type="checkbox"] {
          appearance: none;
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 3px;
          background: rgba(0, 0, 0, 0.3);
          cursor: pointer;
          position: relative;
          transition: all 0.15s ease;
        }
        #vfx-debug-panel-root input[type="checkbox"]:checked {
          background: #f97316;
          border-color: #f97316;
          box-shadow: 0 0 8px rgba(249, 115, 22, 0.4);
        }
        #vfx-debug-panel-root input[type="checkbox"]:checked::after {
          content: '✓';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #000;
          font-size: 10px;
          font-weight: bold;
        }
        #vfx-debug-panel-root input[type="checkbox"]:hover {
          border-color: rgba(249, 115, 22, 0.5);
        }
      `;
      document.head.appendChild(style);
    }
  }
  
  if (!debugRoot) {
    debugRoot = createRoot(debugContainer);
  }
  
  debugRoot.render(
    <DebugPanelContent
      initialValues={values}
      onUpdate={onChange}
    />
  );
}

export function updateDebugPanel(values, onChange) {
  currentValues = values;
  currentOnChange = onChange;
  if (debugRoot) {
    debugRoot.render(
      <DebugPanelContent
        initialValues={values}
        onUpdate={onChange}
      />
    );
  }
}

export function destroyDebugPanel() {
  if (debugRoot) {
    debugRoot.unmount();
    debugRoot = null;
  }
  if (debugContainer && debugContainer.parentNode) {
    debugContainer.parentNode.removeChild(debugContainer);
    debugContainer = null;
  }
  // Clean up injected styles
  const style = document.getElementById("vfx-debug-scrollbar-styles");
  if (style) {
    style.parentNode.removeChild(style);
  }
  currentValues = null;
  currentOnChange = null;
}

export default { renderDebugPanel, updateDebugPanel, destroyDebugPanel };
