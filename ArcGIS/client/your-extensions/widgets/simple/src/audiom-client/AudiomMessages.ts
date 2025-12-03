import { Coordinates } from './AudiomEmbedConfig';

/**
 * Message types from the embedded Audiom map
 */
export enum AudiomMessageType {
  UserPosition = 'userPosition'
}

/**
 * User position update message from Audiom
 */
export interface IAudiomUserPositionMessage {
  userPosition: Coordinates;
}

/**
 * Union type for all Audiom messages
 */
export type AudiomMessage = IAudiomUserPositionMessage;

/**
 * Type guard to check if a message is a user position update
 */
export function isUserPositionMessage(message: any): message is IAudiomUserPositionMessage {
  return message && Array.isArray(message.userPosition) && message.userPosition.length === 2;
}

/**
 * Listener callback for Audiom user position updates
 */
export type AudiomUserPositionListener = (position: Coordinates) => void;

/**
 * Helper class for handling PostMessage communication with embedded Audiom map
 */
export class AudiomMessageHandler {
  private listeners: Set<AudiomUserPositionListener> = new Set();
  private allowedOrigin?: string;
  private messageListener?: (event: MessageEvent) => void;

  constructor(allowedOrigin?: string) {
    this.allowedOrigin = allowedOrigin;
  }

  /**
   * Add a listener for user position updates
   */
  addUserPositionListener(listener: AudiomUserPositionListener): void {
    this.listeners.add(listener);
    this.ensureListening();
  }

  /**
   * Remove a user position listener
   */
  removeUserPositionListener(listener: AudiomUserPositionListener): void {
    this.listeners.delete(listener);
    if (this.listeners.size === 0) {
      this.stopListening();
    }
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(): void {
    this.listeners.clear();
    this.stopListening();
  }

  /**
   * Ensure the message listener is attached
   */
  private ensureListening(): void {
    if (this.messageListener) {
      return;
    }

    this.messageListener = (event: MessageEvent) => {
      // Check origin if specified
      if (this.allowedOrigin && event.origin !== this.allowedOrigin) {
        return;
      }

      // Check if it's a user position message
      if (isUserPositionMessage(event.data)) {
        this.listeners.forEach(listener => {
          listener(event.data.userPosition);
        });
      }
    };

    window.addEventListener('message', this.messageListener, false);
  }

  /**
   * Stop listening for messages
   */
  private stopListening(): void {
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = undefined;
    }
  }

  /**
   * Clean up the message handler
   */
  dispose(): void {
    this.removeAllListeners();
  }
}
