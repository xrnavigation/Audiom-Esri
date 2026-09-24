import { contractError } from './errors';
import { ContractErrorCode, type Envelope } from './types';

export class ContractSession {
	readonly sessionId: string;
	hostViewGeneration = 0;
	private hostSequence = 0;
	private runtimeSequence = 0;
	stateRevision = 0;
	selectionRevision = 0;

	constructor(sessionId: string) {
		this.sessionId = sessionId;
	}

	nextHostSequence(): number {
		this.hostSequence += 1;
		return this.hostSequence;
	}

	nextRuntimeSequence(): number {
		this.runtimeSequence += 1;
		return this.runtimeSequence;
	}

	accept(message: Envelope<unknown>, expectedRevision?: number): void {
		if (message.sessionId !== this.sessionId) {
			throw contractError(ContractErrorCode.Stale, 'session does not match');
		}
		if (message.hostViewGeneration !== this.hostViewGeneration) {
			throw contractError(
				ContractErrorCode.Stale,
				'host view generation does not match',
			);
		}
		if (
			expectedRevision !== undefined &&
			message.revision !== undefined &&
			message.revision < expectedRevision
		) {
			throw contractError(
				ContractErrorCode.Stale,
				'revision is older than the applied revision',
				expectedRevision,
			);
		}
	}

	reset(nextSessionId: string, generation: number): void {
		if (nextSessionId !== this.sessionId || generation !== this.hostViewGeneration) {
			throw contractError(ContractErrorCode.SessionReset, 'session was reset');
		}
	}
}
