import { describe, expect, it } from 'vitest';
import { contractError } from './errors';
import { createInProcessRuntime } from './factory';
import { MemoryRuntimeHost } from './hostDouble';
import { CONTRACT_MESSAGE_NAMES, CONTRACT_RESULT_NAMES, contractJsonSchema } from './schema';
import {
	CONTRACT_VERSION,
	ContractErrorCode,
	GeometryFamily,
	LayerDisposition,
	SelectionOp,
	SourceStatus,
	type CanonicalKey,
	type MapSnapshot,
} from './types';
import { isErrorCode, payloadBytes, versionsCompatible } from './validate';

const key = (recordId: string): CanonicalKey => ({
	dataSourceId: 'details',
	layerId: 'Details',
	recordId,
});

function snapshot(count: number, _revisionSources = 1): MapSnapshot {
	return {
		sources: [
			{
				sourceId: 'Details',
				displayName: 'Details',
				geometryFamily: GeometryFamily.Polygon,
				mapType: 'indoor',
				rulesRef: 'indoors',
				disposition: LayerDisposition.Bound,
				recordCount: count,
				status: SourceStatus.Complete,
			},
		],
		records: Array.from({ length: count }, (_, index) => ({
			key: key(String(index + 1)),
			sourceId: 'Details',
			attributes: { name: `Room ${index + 1}` },
			geometry: {
				type: GeometryFamily.Polygon,
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 0],
					],
				],
			},
			navigable: true,
		})),
	};
}

describe('runtime contract', () => {
	it('publishes a versioned JSON schema and the error codes', () => {
		expect(contractJsonSchema.$id).toContain('1.0');
		expect(CONTRACT_MESSAGE_NAMES).toEqual(
			expect.arrayContaining([
				'hello',
				'replaceSources',
				'setHostSelection',
				'onFeatureEntered',
				'onFeatureExited',
				'requestSelection',
			]),
		);
		expect(CONTRACT_RESULT_NAMES).toEqual(
			expect.arrayContaining(['applied', 'selection', 'focus']),
		);
		expect(contractJsonSchema.$defs.errorCodes.enum).toContain(ContractErrorCode.Stale);
		expect(contractJsonSchema.$defs.errorCodes.enum).toContain(
			ContractErrorCode.TooLarge,
		);
		for (const code of [
			ContractErrorCode.Stale,
			ContractErrorCode.SessionReset,
			ContractErrorCode.Timeout,
			ContractErrorCode.TooLarge,
			ContractErrorCode.IncompatibleVersion,
			ContractErrorCode.RuntimeUnreachable,
			ContractErrorCode.NotInUniverse,
			ContractErrorCode.ActivationRequired,
		]) {
			expect(isErrorCode(code)).toBe(true);
		}
	});

	it('accepts an older host minor and rejects a newer one', () => {
		expect(versionsCompatible('1.0', CONTRACT_VERSION)).toBe(true);
		expect(versionsCompatible('1.1', '1.0')).toBe(false);
		expect(versionsCompatible('2.0', '1.0')).toBe(false);
	});

	it('applies an Indoors-sized snapshot and discards an older revision', async () => {
		const host = new MemoryRuntimeHost();
		const applied: number[] = [];
		const runtime = createInProcessRuntime(
			{
				sessionId: 'a',
				instanceId: 'one',
				applySnapshot: (_snapshot, revision) => applied.push(revision),
			},
			host,
		);
		await runtime.hello({
			product: 'Experience Builder',
			version: '1.18',
			contractVersion: '1.0',
			capabilities: [],
		});
		const result = await runtime.replaceSources(snapshot(3475), 2);
		expect(result).toEqual({ applied: true, revision: 2 });
		expect(runtime.snapshot?.records).toHaveLength(3475);
		await expect(runtime.replaceSources(snapshot(1), 1)).rejects.toMatchObject({
			code: ContractErrorCode.Stale,
		});
		expect(applied).toEqual([2]);
	});

	it('applies each selection operation without retrying a rejection', async () => {
		const host = new MemoryRuntimeHost();
		const runtime = createInProcessRuntime(
			{ sessionId: 'a', instanceId: 'one' },
			host,
		);
		await runtime.replaceSources(snapshot(2), 1);
		await runtime.setHostSelection(
			SelectionOp.Add,
			[{ key: key('1') }, { key: key('2') }],
			1,
		);
		expect(runtime.heldSelection.map((entry) => entry.key.recordId)).toEqual([
			'1',
			'2',
		]);
		await runtime.setHostSelection(SelectionOp.Remove, [{ key: key('1') }], 2);
		expect(runtime.heldSelection.map((entry) => entry.key.recordId)).toEqual(['2']);
		await runtime.setHostSelection(SelectionOp.Replace, [{ key: key('1') }], 3);
		expect(runtime.heldSelection.map((entry) => entry.key.recordId)).toEqual(['1']);
		await runtime.setHostSelection(SelectionOp.Clear, [], 4);
		expect(runtime.heldSelection).toEqual([]);
		host.rejectNextSelection = true;
		const rejected = await runtime.requestSelection(SelectionOp.Add, [key('1')], 1);
		expect(rejected.accepted).toBe(false);
		expect(runtime.heldSelection).toEqual([]);
	});

	it('holds a filtered-out selection and announces a rejected request', async () => {
		const host = new MemoryRuntimeHost();
		const announcements: string[] = [];
		const runtime = createInProcessRuntime(
			{
				sessionId: 'a',
				instanceId: 'one',
				announce: (text) => announcements.push(text),
			},
			host,
		);
		await runtime.replaceSources(snapshot(1), 1);
		await runtime.setHostSelection(
			SelectionOp.Add,
			[{ key: key('missing'), record: undefined }],
			1,
		);
		expect(runtime.heldSelection[0]?.record?.navigable).toBe(false);
		expect(announcements.join(' ')).toContain('not present');
		host.rejectNextSelection = true;
		const rejected = await runtime.requestSelection(
			SelectionOp.Replace,
			[key('1')],
			1,
		);
		expect(rejected.accepted).toBe(false);
		expect(announcements.join(' ')).toContain('rejected');
	});

	it('reports feature enter and exit without treating them as selection', async () => {
		const host = new MemoryRuntimeHost();
		const runtime = createInProcessRuntime(
			{ sessionId: 'a', instanceId: 'one' },
			host,
		);
		await runtime.hello({
			product: 'test',
			version: '1',
			contractVersion: CONTRACT_VERSION,
			capabilities: [],
		});
		await runtime.notifyFeatureEntered([key('1')]);
		await runtime.notifyFeatureExited([key('1')]);
		expect(host.entered).toEqual([[key('1')]]);
		expect(host.exited).toEqual([[key('1')]]);
		expect(runtime.heldSelection).toEqual([]);
	});

	it('does not share state between two in-process runtimes', async () => {
		const first = createInProcessRuntime(
			{ sessionId: 'a', instanceId: 'one' },
			new MemoryRuntimeHost(),
		);
		const second = createInProcessRuntime(
			{ sessionId: 'b', instanceId: 'two' },
			new MemoryRuntimeHost(),
		);
		await first.replaceSources(snapshot(2), 1);
		expect(second.snapshot).toBeNull();
		expect(first.instanceId).not.toBe(second.instanceId);
	});

	it('rejects a payload over the size limit before apply', async () => {
		const runtime = createInProcessRuntime(
			{ sessionId: 'a', instanceId: 'one' },
			new MemoryRuntimeHost(),
		);
		const huge = { text: 'x'.repeat(50_000_001) };
		expect(payloadBytes(huge)).toBeGreaterThan(50_000_000);
		await expect(
			runtime.reportHostError(
				contractError(ContractErrorCode.Invalid, huge.text).toJSON(),
			),
		).rejects.toMatchObject({ code: ContractErrorCode.TooLarge });
	});
});
