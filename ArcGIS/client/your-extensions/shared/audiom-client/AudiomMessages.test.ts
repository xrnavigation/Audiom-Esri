import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import {
  AudiomMessageHandler,
  AudiomOutboundEventType,
  AudiomInboundCommandType,
  AudiomErrorCode,
} from './AudiomMessages';
import { Coordinates } from './Coordinates';

// ── Minimal window/MessageEvent shim for Node environment ───────────

type MessageHandler = (event: { data: unknown; origin: string }) => void;
let messageHandlers: Set<MessageHandler>;

beforeAll(() => {
  messageHandlers = new Set();
  (globalThis as any).window = {
    addEventListener: (_type: string, handler: MessageHandler) => {
      messageHandlers.add(handler);
    },
    removeEventListener: (_type: string, handler: MessageHandler) => {
      messageHandlers.delete(handler);
    },
    dispatchEvent: (event: { data: unknown; origin: string }) => {
      messageHandlers.forEach(h => h(event));
    }
  };
  (globalThis as any).MessageEvent = class MessageEvent {
    type: string;
    data: unknown;
    origin: string;
    constructor(type: string, init: { data?: unknown; origin?: string } = {}) {
      this.type = type;
      this.data = init.data;
      this.origin = init.origin ?? '';
    }
  };
});

afterAll(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).MessageEvent;
});

describe('AudiomMessageHandler', () => {
  let handler: AudiomMessageHandler;

  beforeEach(() => {
    handler = new AudiomMessageHandler();
  });

  afterEach(() => {
    handler.dispose();
  });

  function createIframe(postMessageSpy: ReturnType<typeof vi.fn> = vi.fn()): HTMLIFrameElement {
    return { contentWindow: { postMessage: postMessageSpy } } as unknown as HTMLIFrameElement;
  }

  function dispatchMessage(data: unknown, origin = '') {
    window.dispatchEvent(new MessageEvent('message', { data, origin }));
  }

  // ── Event Listeners ──────────────────────────────────────────────

  describe('on / off', () => {
    it('dispatches payload to a registered listener', () => {
      const cb = vi.fn();
      handler.on(AudiomOutboundEventType.Ready, cb);

      dispatchMessage({ type: 'ready', payload: { apiVersion: '1.0' } });

      expect(cb).toHaveBeenCalledOnce();
      expect(cb).toHaveBeenCalledWith({ apiVersion: '1.0' });
    });

    it('dispatches to multiple listeners for the same event', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      handler.on(AudiomOutboundEventType.PositionChanged, cb1);
      handler.on(AudiomOutboundEventType.PositionChanged, cb2);

      dispatchMessage({ type: 'positionChanged', payload: { position: [10, 20] } });

      expect(cb1).toHaveBeenCalledOnce();
      expect(cb2).toHaveBeenCalledOnce();
    });

    it('does not fire listener for a different event type', () => {
      const cb = vi.fn();
      handler.on(AudiomOutboundEventType.Ready, cb);

      dispatchMessage({ type: 'positionChanged', payload: { position: [0, 0] } });

      expect(cb).not.toHaveBeenCalled();
    });

    it('stops receiving events after off()', () => {
      const cb = vi.fn();
      handler.on(AudiomOutboundEventType.Ready, cb);
      handler.off(AudiomOutboundEventType.Ready, cb);

      dispatchMessage({ type: 'ready', payload: { apiVersion: '1.0' } });

      expect(cb).not.toHaveBeenCalled();
    });

    it('off() for unknown listener is a no-op', () => {
      const cb = vi.fn();
      expect(() => handler.off(AudiomOutboundEventType.Ready, cb)).not.toThrow();
    });
  });

  describe('removeAllListeners', () => {
    it('removes all listeners for a specific event', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      handler.on(AudiomOutboundEventType.Ready, cb1);
      handler.on(AudiomOutboundEventType.PositionChanged, cb2);

      handler.removeAllListeners(AudiomOutboundEventType.Ready);

      dispatchMessage({ type: 'ready', payload: { apiVersion: '1.0' } });
      dispatchMessage({ type: 'positionChanged', payload: { position: [1, 2] } });

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalledOnce();
    });

    it('removes all listeners when called without argument', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      handler.on(AudiomOutboundEventType.Ready, cb1);
      handler.on(AudiomOutboundEventType.Error, cb2);

      handler.removeAllListeners();

      dispatchMessage({ type: 'ready', payload: { apiVersion: '1.0' } });
      dispatchMessage({ type: 'error', payload: { code: 'NOT_READY', message: 'err' } });

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('removes all listeners and stops listening', () => {
      const cb = vi.fn();
      handler.on(AudiomOutboundEventType.Ready, cb);
      handler.dispose();

      dispatchMessage({ type: 'ready', payload: { apiVersion: '1.0' } });

      expect(cb).not.toHaveBeenCalled();
    });
  });

  // ── Origin filtering ─────────────────────────────────────────────

  describe('allowedOrigin', () => {
    it('accepts messages when no origin restriction is set', () => {
      const cb = vi.fn();
      handler.on(AudiomOutboundEventType.Ready, cb);

      dispatchMessage({ type: 'ready', payload: { apiVersion: '1.0' } }, 'https://any.com');

      expect(cb).toHaveBeenCalledOnce();
    });

    it('accepts messages from the allowed origin', () => {
      const restricted = new AudiomMessageHandler('https://trusted.com');
      const cb = vi.fn();
      restricted.on(AudiomOutboundEventType.Ready, cb);

      dispatchMessage({ type: 'ready', payload: { apiVersion: '1.0' } }, 'https://trusted.com');

      expect(cb).toHaveBeenCalledOnce();
      restricted.dispose();
    });

    it('rejects messages from a disallowed origin', () => {
      const restricted = new AudiomMessageHandler('https://trusted.com');
      const cb = vi.fn();
      restricted.on(AudiomOutboundEventType.Ready, cb);

      dispatchMessage({ type: 'ready', payload: { apiVersion: '1.0' } }, 'https://evil.com');

      expect(cb).not.toHaveBeenCalled();
      restricted.dispose();
    });
  });

  // ── Message validation ────────────────────────────────────────────

  describe('message validation', () => {
    it('ignores null data', () => {
      const cb = vi.fn();
      handler.on(AudiomOutboundEventType.Ready, cb);

      dispatchMessage(null);

      expect(cb).not.toHaveBeenCalled();
    });

    it('ignores data without a string type field', () => {
      const cb = vi.fn();
      handler.on(AudiomOutboundEventType.Ready, cb);

      dispatchMessage({ type: 123 });
      dispatchMessage({ notType: 'ready' });
      dispatchMessage('just a string');

      expect(cb).not.toHaveBeenCalled();
    });
  });

  // ── Inbound Commands ─────────────────────────────────────────────

  describe('moveAvatar', () => {
    it('posts moveAvatar command with array position', () => {
      const spy = vi.fn();
      const iframe = createIframe(spy);

      handler.moveAvatar(iframe, [10, 20], 'https://app.audiom.net');

      expect(spy).toHaveBeenCalledWith(
        { type: AudiomInboundCommandType.MoveAvatar, payload: { position: [10, 20] } },
        'https://app.audiom.net'
      );
    });

    it('posts moveAvatar command with Coordinates object', () => {
      const spy = vi.fn();
      const iframe = createIframe(spy);
      const coords = Coordinates.create(-122.4194, 37.7749);

      handler.moveAvatar(iframe, coords, 'https://app.audiom.net');

      expect(spy).toHaveBeenCalledWith(
        { type: AudiomInboundCommandType.MoveAvatar, payload: { position: [-122.4194, 37.7749] } },
        'https://app.audiom.net'
      );
    });
  });

  describe('getState', () => {
    it('posts getState command', () => {
      const spy = vi.fn();
      const iframe = createIframe(spy);

      handler.getState(iframe, 'https://app.audiom.net');

      expect(spy).toHaveBeenCalledWith(
        { type: AudiomInboundCommandType.GetState },
        'https://app.audiom.net'
      );
    });
  });

  describe('getEnclosingFeatures', () => {
    it('posts getEnclosingFeatures command', () => {
      const spy = vi.fn();
      const iframe = createIframe(spy);

      handler.getEnclosingFeatures(iframe, 'https://app.audiom.net');

      expect(spy).toHaveBeenCalledWith(
        { type: AudiomInboundCommandType.GetEnclosingFeatures },
        'https://app.audiom.net'
      );
    });
  });

  describe('setFilters', () => {
    it('posts setFilters command with global and scan filters', () => {
      const spy = vi.fn();
      const iframe = createIframe(spy);

      handler.setFilters(iframe, { global: ['road'], scan: ['building'] }, 'https://app.audiom.net');

      expect(spy).toHaveBeenCalledWith(
        {
          type: AudiomInboundCommandType.SetFilters,
          payload: { global: ['road'], scan: ['building'] }
        },
        'https://app.audiom.net'
      );
    });
  });

  describe('executeCommand', () => {
    it('posts executeCommand command', () => {
      const spy = vi.fn();
      const iframe = createIframe(spy);

      handler.executeCommand(iframe, 'sonar', 'https://app.audiom.net');

      expect(spy).toHaveBeenCalledWith(
        { type: AudiomInboundCommandType.ExecuteCommand, payload: { command: 'sonar' } },
        'https://app.audiom.net'
      );
    });
  });

  describe('iframe with no contentWindow', () => {
    it('does not throw when contentWindow is null', () => {
      const iframe = { contentWindow: null } as unknown as HTMLIFrameElement;
      expect(() => handler.moveAvatar(iframe, [0, 0], '*')).not.toThrow();
    });
  });
});

// ── Enum value sanity checks ─────────────────────────────────────────

describe('AudiomOutboundEventType', () => {
  it('has expected string values', () => {
    expect(AudiomOutboundEventType.Ready).toBe('ready');
    expect(AudiomOutboundEventType.PositionChanged).toBe('positionChanged');
    expect(AudiomOutboundEventType.FeatureEntered).toBe('featureEntered');
    expect(AudiomOutboundEventType.FeatureExited).toBe('featureExited');
    expect(AudiomOutboundEventType.FeatureSelected).toBe('featureSelected');
    expect(AudiomOutboundEventType.StateChanged).toBe('stateChanged');
    expect(AudiomOutboundEventType.Error).toBe('error');
  });
});

describe('AudiomInboundCommandType', () => {
  it('has expected string values', () => {
    expect(AudiomInboundCommandType.MoveAvatar).toBe('moveAvatar');
    expect(AudiomInboundCommandType.GetState).toBe('getState');
    expect(AudiomInboundCommandType.GetEnclosingFeatures).toBe('getEnclosingFeatures');
    expect(AudiomInboundCommandType.SetFilters).toBe('setFilters');
    expect(AudiomInboundCommandType.ExecuteCommand).toBe('executeCommand');
  });
});

describe('AudiomErrorCode', () => {
  it('has expected string values', () => {
    expect(AudiomErrorCode.INVALID_ORIGIN).toBe('INVALID_ORIGIN');
    expect(AudiomErrorCode.INVALID_MESSAGE).toBe('INVALID_MESSAGE');
    expect(AudiomErrorCode.UNKNOWN_COMMAND).toBe('UNKNOWN_COMMAND');
    expect(AudiomErrorCode.COMMAND_FAILED).toBe('COMMAND_FAILED');
    expect(AudiomErrorCode.NOT_READY).toBe('NOT_READY');
  });
});
