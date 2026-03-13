import { Coordinates } from './Coordinates';

// ─── Outbound Event Types (Embed → Parent) ────────────────────────────

/**
 * Event types sent from the embedded Audiom map to the parent window
 */
export enum AudiomOutboundEventType {
  /** Embed is fully initialized and ready to receive commands */
  Ready = 'ready',
  /** Avatar position changed */
  PositionChanged = 'positionChanged',
  /** Avatar entered one or more map features */
  FeatureEntered = 'featureEntered',
  /** Avatar exited one or more map features */
  FeatureExited = 'featureExited',
  /** Avatar crossed a feature boundary; contains all enclosing features */
  FeatureSelected = 'featureSelected',
  /** Response to a getState query */
  StateChanged = 'stateChanged',
  /** An error occurred processing an inbound command */
  Error = 'error'
}

/**
 * Error codes returned by the embedded Audiom map
 */
export enum AudiomErrorCode {
  /** Message from a disallowed origin */
  INVALID_ORIGIN = 'INVALID_ORIGIN',
  /** Message format is invalid */
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  /** Unknown command type */
  UNKNOWN_COMMAND = 'UNKNOWN_COMMAND',
  /** Command execution failed */
  COMMAND_FAILED = 'COMMAND_FAILED',
  /** API not initialized */
  NOT_READY = 'NOT_READY'
}

/**
 * Payload for a map feature
 */
export interface IFeaturePayload {
  id: string;
  name: string;
  type: string;
  position: [number, number];
  properties: Record<string, unknown>;
}

// ─── Outbound Payloads ─────────────────────────────────────────────────

export interface IReadyPayload {
  apiVersion: string;
}

export interface IPositionChangedPayload {
  position: [number, number];
}

export interface IFeatureEnteredPayload {
  features: IFeaturePayload[];
}

export interface IFeatureExitedPayload {
  features: IFeaturePayload[];
}

export interface IFeatureSelectedPayload {
  features: IFeaturePayload[];
}

export interface IStateChangedPayload {
  position: [number, number];
}

export interface IAudiomErrorPayload {
  code: AudiomErrorCode;
  message: string;
}

// ─── Outbound Message Union ────────────────────────────────────────────

export type AudiomOutboundMessage =
  | { type: AudiomOutboundEventType.Ready; payload: IReadyPayload }
  | { type: AudiomOutboundEventType.PositionChanged; payload: IPositionChangedPayload }
  | { type: AudiomOutboundEventType.FeatureEntered; payload: IFeatureEnteredPayload }
  | { type: AudiomOutboundEventType.FeatureExited; payload: IFeatureExitedPayload }
  | { type: AudiomOutboundEventType.FeatureSelected; payload: IFeatureSelectedPayload }
  | { type: AudiomOutboundEventType.StateChanged; payload: IStateChangedPayload }
  | { type: AudiomOutboundEventType.Error; payload: IAudiomErrorPayload };

// ─── Inbound Command Types (Parent → Embed) ───────────────────────────

/**
 * Command types sent from the parent window to the embedded Audiom map
 */
export enum AudiomInboundCommandType {
  /** Move the avatar to a specific position */
  MoveAvatar = 'moveAvatar',
  /** Query the current avatar position */
  GetState = 'getState',
  /** Query features currently enclosing the avatar */
  GetEnclosingFeatures = 'getEnclosingFeatures',
  /** Set feature type filters */
  SetFilters = 'setFilters',
  /** Execute an Audiom keyboard command programmatically */
  ExecuteCommand = 'executeCommand'
}

// ─── Inbound Payloads ──────────────────────────────────────────────────

export interface IMoveAvatarPayload {
  position: [number, number];
}

export interface ISetFiltersPayload {
  /** Feature types to show globally */
  global?: string[];
  /** Feature types to include in sonar scan */
  scan?: string[];
}

export interface IExecuteCommandPayload {
  command: string;
}

// ─── Inbound Command Union ─────────────────────────────────────────────

export type AudiomInboundCommand =
  | { type: AudiomInboundCommandType.MoveAvatar; payload: IMoveAvatarPayload }
  | { type: AudiomInboundCommandType.GetState }
  | { type: AudiomInboundCommandType.GetEnclosingFeatures }
  | { type: AudiomInboundCommandType.SetFilters; payload: ISetFiltersPayload }
  | { type: AudiomInboundCommandType.ExecuteCommand; payload: IExecuteCommandPayload };

// ─── Listener Types ────────────────────────────────────────────────────

/**
 * Map from outbound event types to their payload types
 */
export interface AudiomEventPayloadMap {
  [AudiomOutboundEventType.Ready]: IReadyPayload;
  [AudiomOutboundEventType.PositionChanged]: IPositionChangedPayload;
  [AudiomOutboundEventType.FeatureEntered]: IFeatureEnteredPayload;
  [AudiomOutboundEventType.FeatureExited]: IFeatureExitedPayload;
  [AudiomOutboundEventType.FeatureSelected]: IFeatureSelectedPayload;
  [AudiomOutboundEventType.StateChanged]: IStateChangedPayload;
  [AudiomOutboundEventType.Error]: IAudiomErrorPayload;
}

/**
 * Typed listener callback for a specific outbound event
 */
export type AudiomEventListener<T extends AudiomOutboundEventType> =
  (payload: AudiomEventPayloadMap[T]) => void;

// ─── Message Handler ───────────────────────────────────────────────────

/**
 * Helper class for bidirectional PostMessage communication with an embedded Audiom map.
 *
 * Listens for outbound events from the embed and provides methods to send
 * inbound commands to the embed.
 */
export class AudiomMessageHandler {
  private listenerMap: Map<AudiomOutboundEventType, Set<AudiomEventListener<any>>> = new Map();
  private allowedOrigin?: string;
  private messageListener?: (event: MessageEvent) => void;

  /**
   * @param allowedOrigin  If provided, only messages from this origin are accepted.
   */
  constructor(allowedOrigin?: string) {
    this.allowedOrigin = allowedOrigin;
  }

  // ── Event Listeners ────────────────────────────────────────────────

  /**
   * Register a typed listener for an outbound event from the embed.
   */
  on<T extends AudiomOutboundEventType>(
    eventType: T,
    listener: AudiomEventListener<T>
  ): void {
    let listeners = this.listenerMap.get(eventType);
    if (!listeners) {
      listeners = new Set();
      this.listenerMap.set(eventType, listeners);
    }
    listeners.add(listener);
    this.ensureListening();
  }

  /**
   * Remove a specific listener for an outbound event.
   */
  off<T extends AudiomOutboundEventType>(
    eventType: T,
    listener: AudiomEventListener<T>
  ): void {
    const listeners = this.listenerMap.get(eventType);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listenerMap.delete(eventType);
      }
    }
    if (this.listenerMap.size === 0) {
      this.stopListening();
    }
  }

  /**
   * Remove all listeners, optionally for a specific event type.
   */
  removeAllListeners(eventType?: AudiomOutboundEventType): void {
    if (eventType) {
      this.listenerMap.delete(eventType);
    } else {
      this.listenerMap.clear();
    }
    if (this.listenerMap.size === 0) {
      this.stopListening();
    }
  }

  // ── Inbound Commands ───────────────────────────────────────────────

  /**
   * Move the avatar to a specific geographic position.
   */
  moveAvatar(iframe: HTMLIFrameElement, position: Coordinates | [number, number], targetOrigin: string): void {
    const pos: [number, number] = position instanceof Coordinates
      ? position.toArray()
      : position;
    this.postCommand(iframe, {
      type: AudiomInboundCommandType.MoveAvatar,
      payload: { position: pos }
    }, targetOrigin);
  }

  /**
   * Query the current avatar position. The embed responds with a `stateChanged` event.
   */
  getState(iframe: HTMLIFrameElement, targetOrigin: string): void {
    this.postCommand(iframe, {
      type: AudiomInboundCommandType.GetState
    }, targetOrigin);
  }

  /**
   * Query features currently enclosing the avatar. The embed responds with a `featureSelected` event.
   */
  getEnclosingFeatures(iframe: HTMLIFrameElement, targetOrigin: string): void {
    this.postCommand(iframe, {
      type: AudiomInboundCommandType.GetEnclosingFeatures
    }, targetOrigin);
  }

  /**
   * Set feature type filters for global display and/or sonar scanning.
   */
  setFilters(iframe: HTMLIFrameElement, filters: ISetFiltersPayload, targetOrigin: string): void {
    this.postCommand(iframe, {
      type: AudiomInboundCommandType.SetFilters,
      payload: filters
    }, targetOrigin);
  }

  /**
   * Execute an Audiom keyboard command programmatically.
   */
  executeCommand(iframe: HTMLIFrameElement, command: string, targetOrigin: string): void {
    this.postCommand(iframe, {
      type: AudiomInboundCommandType.ExecuteCommand,
      payload: { command }
    }, targetOrigin);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  /**
   * Clean up the message handler and remove all listeners.
   */
  dispose(): void {
    this.removeAllListeners();
  }

  // ── Private ────────────────────────────────────────────────────────

  private postCommand(iframe: HTMLIFrameElement, command: AudiomInboundCommand, targetOrigin: string): void {
    iframe.contentWindow?.postMessage(command, targetOrigin);
  }

  private ensureListening(): void {
    if (this.messageListener) {
      return;
    }

    this.messageListener = (event: MessageEvent) => {
      if (this.allowedOrigin && event.origin !== this.allowedOrigin) {
        return;
      }

      const data = event.data;
      if (!data || typeof data.type !== 'string') {
        return;
      }

      const listeners = this.listenerMap.get(data.type as AudiomOutboundEventType);
      if (listeners) {
        listeners.forEach(listener => {
          listener(data.payload);
        });
      }
    };

    window.addEventListener('message', this.messageListener, false);
  }

  private stopListening(): void {
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = undefined;
    }
  }
}
