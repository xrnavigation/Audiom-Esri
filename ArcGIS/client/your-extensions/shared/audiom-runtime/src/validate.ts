import { contractError } from './errors';
import {
	CONTRACT_VERSION,
	ContractErrorCode,
	MAX_PAYLOAD_BYTES,
} from './types';

export function payloadBytes(payload: unknown): number {
	return new TextEncoder().encode(JSON.stringify(payload)).length;
}

export function assertPayloadSize(payload: unknown): void {
	const bytes = payloadBytes(payload);
	if (bytes > MAX_PAYLOAD_BYTES) {
		throw contractError(ContractErrorCode.TooLarge, `payload is ${bytes} bytes`);
	}
}

export function copyPayload<T>(payload: T): T {
	assertPayloadSize(payload);
	return JSON.parse(JSON.stringify(payload)) as T;
}

export function versionsCompatible(
	hostVersion: string,
	runtimeVersion = CONTRACT_VERSION,
): boolean {
	const host = parseVersion(hostVersion);
	const runtime = parseVersion(runtimeVersion);
	if (!host || !runtime) return false;
	return host.major === runtime.major && host.minor <= runtime.minor;
}

export function assertCompatible(hostVersion: string): void {
	if (!versionsCompatible(hostVersion)) {
		throw contractError(
			ContractErrorCode.IncompatibleVersion,
			`host ${hostVersion} is not compatible with runtime ${CONTRACT_VERSION}`,
		);
	}
}

function parseVersion(value: string): { major: number; minor: number } | null {
	const match = /^(\d+)\.(\d+)$/.exec(value);
	if (!match) return null;
	return { major: Number(match[1]), minor: Number(match[2]) };
}

export function isPlainData(value: unknown): boolean {
	if (value === null) return true;
	if (typeof value === 'string' || typeof value === 'boolean') return true;
	if (typeof value === 'number') return Number.isFinite(value);
	if (Array.isArray(value)) return value.every(isPlainData);
	if (typeof value !== 'object') return false;
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) return false;
	return Object.values(value as Record<string, unknown>).every(isPlainData);
}

export function assertPlainData(value: unknown, label: string): void {
	if (!isPlainData(value)) {
		throw contractError(
			ContractErrorCode.Invalid,
			`${label} is not serializable contract data`,
		);
	}
}

export function isErrorCode(value: string): value is ContractErrorCode {
	return Object.values(ContractErrorCode).includes(value as ContractErrorCode);
}
