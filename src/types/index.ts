// Global TypeScript definitions

export interface AppConfig {
  server: {
    port: number;
    host: string;
    nodeEnv: string;
  };
  mentraos: {
    packageName: string;
    apiKey: string;
  };
  redis: {
    url: string;
    host: string;
    port: number;
    password?: string;
  };
  ai: {
    enableVision: boolean;
    enableNLP: boolean;
    enableTensorFlow: boolean;
    maxConcurrentRequests: number;
  };
  security: {
    jwtSecret: string;
    encryptionKey: string;
    enableBiometric: boolean;
    sessionTimeout: number;
  };
  features: {
    multiPlatform: boolean;
    accessibility: boolean;
    spatialUI: boolean;
    analytics: boolean;
  };
  logging: {
    level: string;
    enableConsole: boolean;
    enableFile: boolean;
  };
}

export interface SessionContext {
  sessionId: string;
  userId: string;
  deviceType: 'glasses' | 'web' | 'mobile' | 'desktop';
  capabilities: DeviceCapabilities;
  preferences: UserPreferences;
  state: SessionState;
}

export interface DeviceCapabilities {
  hasCamera: boolean;
  hasMicrophone: boolean;
  hasDisplay: boolean;
  hasSpeakers: boolean;
  hasEyeTracking: boolean;
  hasGestureRecognition: boolean;
  supports3D: boolean;
  supportsHaptics: boolean;
}

export interface UserPreferences {
  language: string;
  voiceEnabled: boolean;
  visualTheme: 'light' | 'dark' | 'auto';
  accessibility: AccessibilityPreferences;
  privacy: PrivacyPreferences;
  ai: AIPreferences;
}

export interface AccessibilityPreferences {
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  highContrast: boolean;
  voiceNavigation: boolean;
  eyeTracking: boolean;
  gestureNavigation: boolean;
  spatialAudio: boolean;
}

export interface PrivacyPreferences {
  dataCollection: 'minimal' | 'standard' | 'enhanced';
  biometricAuth: boolean;
  locationTracking: boolean;
  usageAnalytics: boolean;
  personalizedContent: boolean;
}

export interface AIPreferences {
  autoTranslation: boolean;
  contextAwareness: boolean;
  predictiveAssistance: boolean;
  emotionRecognition: boolean;
  objectRecognition: boolean;
}

export interface SessionState {
  isActive: boolean;
  connectedAt: Date;
  lastActivity: Date;
  currentView: ViewState;
  aiContext: AIContext;
}

export interface ViewState {
  type: string;
  content: any;
  position?: SpatialPosition;
  metadata?: Record<string, any>;
}

export interface SpatialPosition {
  x: number;
  y: number;
  z: number;
  rotation: {
    x: number;
    y: number;
    z: number;
    w: number;
  };
  scale: {
    x: number;
    y: number;
    z: number;
  };
}

export interface AIContext {
  currentScene?: SceneAnalysis;
  userIntent?: Intent;
  conversationHistory: ConversationEntry[];
  environmentContext: EnvironmentContext;
}

export interface SceneAnalysis {
  objects: DetectedObject[];
  faces: DetectedFace[];
  text: DetectedText[];
  spatial: SpatialMapping;
  confidence: number;
  timestamp: Date;
}

export interface DetectedObject {
  id: string;
  label: string;
  confidence: number;
  boundingBox: BoundingBox;
  position3D?: SpatialPosition;
}

export interface DetectedFace {
  id: string;
  confidence: number;
  emotions: EmotionScores;
  landmarks: FaceLandmarks;
  boundingBox: BoundingBox;
}

export interface DetectedText {
  id: string;
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
  language?: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EmotionScores {
  happy: number;
  sad: number;
  angry: number;
  surprised: number;
  neutral: number;
  fear: number;
  disgust: number;
}

export interface FaceLandmarks {
  leftEye: Point2D;
  rightEye: Point2D;
  nose: Point2D;
  mouth: Point2D;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface SpatialMapping {
  anchors: SpatialAnchor[];
  surfaces: DetectedSurface[];
  lighting: LightingInfo;
}

export interface SpatialAnchor {
  id: string;
  position: SpatialPosition;
  confidence: number;
  type: 'wall' | 'floor' | 'ceiling' | 'object' | 'marker';
}

export interface DetectedSurface {
  id: string;
  type: 'horizontal' | 'vertical';
  bounds: SpatialBounds;
  normal: Vector3D;
}

export interface SpatialBounds {
  min: Vector3D;
  max: Vector3D;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface LightingInfo {
  ambientIntensity: number;
  primaryDirection: Vector3D;
  colorTemperature: number;
}

export interface Intent {
  action: string;
  confidence: number;
  parameters: Record<string, any>;
  timestamp: Date;
}

export interface ConversationEntry {
  id: string;
  timestamp: Date;
  type: 'user' | 'system';
  content: string;
  metadata?: Record<string, any>;
}

export interface EnvironmentContext {
  location?: GeolocationData;
  ambientSound: AudioAnalysis;
  lighting: LightingInfo;
  temperature?: number;
  activity: ActivityContext;
}

export interface GeolocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  heading?: number;
  speed?: number;
}

export interface AudioAnalysis {
  volume: number;
  frequency: FrequencyData;
  noiseLevel: number;
  speechPresent: boolean;
}

export interface FrequencyData {
  low: number;
  mid: number;
  high: number;
}

export interface ActivityContext {
  type: 'walking' | 'sitting' | 'standing' | 'driving' | 'unknown';
  confidence: number;
  movement: MovementData;
}

export interface MovementData {
  acceleration: Vector3D;
  rotation: Vector3D;
  velocity?: Vector3D;
}

// Event types for the system
export interface SystemEvents {
  'session:started': { sessionId: string; userId: string; context: SessionContext };
  'session:ended': { sessionId: string; userId: string; duration: number };
  'ai:vision:analyzed': { sessionId: string; analysis: SceneAnalysis };
  'ai:intent:detected': { sessionId: string; intent: Intent };
  'ai:translation:completed': { sessionId: string; originalText: string; translatedText: string; language: string };
  'accessibility:command:voice': { sessionId: string; command: string; confidence: number };
  'accessibility:gaze:detected': { sessionId: string; target: string; dwellTime: number };
  'security:biometric:verified': { sessionId: string; method: string; success: boolean };
  'error:system': { error: Error; context: Record<string, any> };
}

// Error types
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400, context);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed', context?: Record<string, any>) {
    super(message, 'AUTHENTICATION_ERROR', 401, context);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Authorization failed', context?: Record<string, any>) {
    super(message, 'AUTHORIZATION_ERROR', 403, context);
    this.name = 'AuthorizationError';
  }
}

export class AIProcessingError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'AI_PROCESSING_ERROR', 500, context);
    this.name = 'AIProcessingError';
  }
}