import { type ContractError, ContractErrorCode } from './types';

export class RuntimeContractError extends Error {
	readonly code: ContractErrorCode;
	readonly currentRevision?: number;

	constructor(code: ContractErrorCode, message: string, currentRevision?: number) {
		super(message);
		this.name = 'RuntimeContractError';
		this.code = code;
		this.currentRevision = currentRevision;
	}

	toJSON(): ContractError {
		return {
			code: this.code,
			message: this.message,
			...(this.currentRevision === undefined
				? {}
				: { currentRevision: this.currentRevision }),
		};
	}
}

export function contractError(
	code: ContractErrorCode,
	message: string,
	currentRevision?: number,
): RuntimeContractError {
	return new RuntimeContractError(code, message, currentRevision);
}
