import { contractError } from './errors';
import { ContractSession } from './session';
import {
	CONTRACT_VERSION,
	type AppliedResult,
	type AudiomRuntime,
	type AvatarState,
	type CanonicalKey,
	ContractErrorCode,
	type ContractError,
	type EffectiveState,
	type FocusResult,
	type FocusTarget,
	type LngLat,
	type MapSnapshot,
	type RecordSnapshot,
	type RuntimeHello,
	type RuntimeHost,
	type SelectionEntry,
	SelectionOp,
	type SelectionResult,
	SourceStatus,
	WidgetLifecycle,
} from './types';
import { assertCompatible, assertPlainData, copyPayload } from './validate';

export interface InProcessRuntimeConfig {
	sessionId: string;
	instanceId: string;
	locale?: string;
	describeFields?: (rulesRef: string, mapType: string) => string[];
	applySnapshot?: (snapshot: MapSnapshot, revision: number) => void;
	applyEffectiveState?: (state: EffectiveState, revision: number) => void;
	applySelection?: (
		op: SelectionOp,
		entries: SelectionEntry[],
		revision: number,
	) => void;
	openFeature?: (key: CanonicalKey) => void;
	restoreAvatar?: (position: LngLat, orientation: number) => void;
	focus?: (target: FocusTarget) => FocusResult;
	announce?: (text: string) => void;
}

export interface InProcessRuntime extends AudiomRuntime {
	readonly session: ContractSession;
	readonly instanceId: string;
	readonly snapshot: MapSnapshot | null;
	readonly heldSelection: SelectionEntry[];
	notifyAvatarChanged(state: AvatarState): Promise<AppliedResult>;
	notifyFeatureEntered(keys: CanonicalKey[]): Promise<AppliedResult>;
	notifyFeatureExited(keys: CanonicalKey[]): Promise<AppliedResult>;
	requestSelection(
		op: SelectionOp,
		keys: CanonicalKey[],
		baseRevision: number,
	): Promise<SelectionResult>;
}

function later<T>(work: () => T | Promise<T>): Promise<T> {
	return Promise.resolve().then(work);
}

function keyId(key: CanonicalKey): string {
	return `${key.dataSourceId}|${key.layerId}|${key.recordId}`;
}

export function createInProcessRuntime(
	config: InProcessRuntimeConfig,
	host: RuntimeHost,
): InProcessRuntime {
	const session = new ContractSession(config.sessionId);
	let snapshot: MapSnapshot | null = null;
	let heldSelection: SelectionEntry[] = [];
	let disposed = false;

	function guard(): void {
		if (disposed) {
			throw contractError(
				ContractErrorCode.RuntimeUnreachable,
				'runtime was disposed',
			);
		}
	}

	function applied(revision = session.stateRevision): AppliedResult {
		return { applied: true, revision };
	}

	function stamp<T>(payload: T, revision?: number) {
		return {
			sessionId: session.sessionId,
			hostViewGeneration: session.hostViewGeneration,
			sequence: session.nextHostSequence(),
			revision,
			payload,
		};
	}

	const runtime: InProcessRuntime = {
		session,
		instanceId: config.instanceId,
		get snapshot() {
			return snapshot;
		},
		get heldSelection() {
			return heldSelection;
		},
		hello(hostInfo) {
			return later(() => {
				guard();
				const info = copyPayload(hostInfo);
				assertPlainData(info, 'hostInfo');
				assertCompatible(info.contractVersion);
				session.hostViewGeneration += 1;
				const result: RuntimeHello = {
					contractVersion: CONTRACT_VERSION,
					capabilities: ['snapshot', 'selection', 'viewpoint', 'lifecycle'],
				};
				return copyPayload(result);
			});
		},
		describeSource(rulesRef, mapType) {
			return later(() => {
				guard();
				const fields = config.describeFields?.(rulesRef, mapType) ?? [];
				return copyPayload({ fields });
			});
		},
		replaceSources(nextSnapshot, stateRevision) {
			return later(() => {
				guard();
				const incoming = copyPayload(nextSnapshot);
				assertPlainData(incoming, 'snapshot');
				if (stateRevision < session.stateRevision) {
					throw contractError(
						ContractErrorCode.Stale,
						'older snapshot revision',
						session.stateRevision,
					);
				}
				const failed = incoming.sources.find(
					(source) => source.status === SourceStatus.Failed,
				);
				if (failed) {
					throw contractError(
						ContractErrorCode.Invalid,
						failed.reason ?? `source ${failed.sourceId} failed`,
					);
				}
				session.accept(stamp(incoming, stateRevision), session.stateRevision);
				config.applySnapshot?.(incoming, stateRevision);
				snapshot = incoming;
				session.stateRevision = stateRevision;
				return applied(stateRevision);
			});
		},
		setEffectiveState(state, stateRevision) {
			return later(() => {
				guard();
				const incoming = copyPayload(state);
				assertPlainData(incoming, 'effectiveState');
				if (stateRevision < session.stateRevision) {
					throw contractError(
						ContractErrorCode.Stale,
						'older effective state',
						session.stateRevision,
					);
				}
				config.applyEffectiveState?.(incoming, stateRevision);
				session.stateRevision = stateRevision;
				return applied(stateRevision);
			});
		},
		setHostSelection(op, entries, selectionRevision) {
			return later(() => {
				guard();
				const incoming = copyPayload(entries);
				assertPlainData(incoming, 'selection');
				if (selectionRevision < session.selectionRevision) {
					throw contractError(
						ContractErrorCode.Stale,
						'older selection revision',
						session.selectionRevision,
					);
				}
				heldSelection = applySelection(op, heldSelection, incoming, snapshot);
				const outside = heldSelection.filter(
					(entry) => !recordInUniverse(snapshot, entry.key),
				);
				if (outside.length > 0) {
					config.announce?.(
						`${outside.length} selected record not present in the map`,
					);
				}
				config.applySelection?.(op, heldSelection, selectionRevision);
				session.selectionRevision = selectionRevision;
				return applied(selectionRevision);
			});
		},
		openFeatureContent(key) {
			return later(() => {
				guard();
				const incoming = copyPayload(key);
				if (!recordInUniverse(snapshot, incoming)) {
					config.announce?.('selected and not present in the map');
					throw contractError(
						ContractErrorCode.NotInUniverse,
						'record is not in the audio universe',
					);
				}
				config.openFeature?.(incoming);
				return applied();
			});
		},
		restoreAvatar(position, orientation) {
			return later(() => {
				guard();
				config.restoreAvatar?.(copyPayload(position), orientation);
				return applied();
			});
		},
		focusRuntime(target) {
			return later(() => {
				guard();
				return config.focus?.(target) ?? { focused: true, blocked: false };
			});
		},
		setHostLifecycle(widgetState: WidgetLifecycle, viewState: string, authState: string) {
			return later(() => {
				guard();
				assertPlainData({ widgetState, viewState, authState }, 'lifecycle');
				if (widgetState !== WidgetLifecycle.Opened) {
					config.announce?.('audio suspended');
				}
				return applied();
			});
		},
		reportHostError(error: ContractError) {
			return later(() => {
				guard();
				const incoming = copyPayload(error);
				config.announce?.(incoming.message);
				return applied();
			});
		},
		dispose() {
			return later(() => {
				disposed = true;
				snapshot = null;
				heldSelection = [];
				return applied();
			});
		},
		notifyAvatarChanged(state: AvatarState) {
			return later(() => {
				const incoming = copyPayload(state);
				session.accept(stamp(incoming));
				return host.onAvatarChanged(incoming);
			});
		},
		notifyFeatureEntered(keys: CanonicalKey[]) {
			return later(() => {
				const incoming = copyPayload(keys);
				session.accept(stamp(incoming));
				return host.onFeatureEntered(incoming);
			});
		},
		notifyFeatureExited(keys: CanonicalKey[]) {
			return later(() => {
				const incoming = copyPayload(keys);
				session.accept(stamp(incoming));
				return host.onFeatureExited(incoming);
			});
		},
		requestSelection(op, keys, baseRevision) {
			return later(async () => {
				guard();
				const result = await host.requestSelection(
					op,
					copyPayload(keys),
					baseRevision,
				);
				const copied = copyPayload(result);
				if (!copied.accepted) {
					config.announce?.(
						`selection rejected at revision ${copied.revision}`,
					);
				} else {
					config.announce?.(`selection ${op}`);
				}
				return copied;
			});
		},
	};

	return runtime;
}

function recordInUniverse(
	snapshot: MapSnapshot | null,
	key: CanonicalKey,
): boolean {
	if (!snapshot) return false;
	return snapshot.records.some(
		(record) => record.navigable && keyId(record.key) === keyId(key),
	);
}

function applySelection(
	op: SelectionOp,
	current: SelectionEntry[],
	incoming: SelectionEntry[],
	snapshot: MapSnapshot | null,
): SelectionEntry[] {
	if (op === SelectionOp.Clear) return [];
	if (op === SelectionOp.Replace) {
		return incoming.map((entry) => holdIfMissing(entry, snapshot));
	}
	if (op === SelectionOp.Add) {
		const next = [...current];
		for (const entry of incoming) {
			if (!next.some((item) => keyId(item.key) === keyId(entry.key))) {
				next.push(holdIfMissing(entry, snapshot));
			}
		}
		return next;
	}
	const remove = new Set(incoming.map((entry) => keyId(entry.key)));
	return current.filter((entry) => !remove.has(keyId(entry.key)));
}

function holdIfMissing(
	entry: SelectionEntry,
	snapshot: MapSnapshot | null,
): SelectionEntry {
	const known = snapshot?.records.find(
		(record) => keyId(record.key) === keyId(entry.key),
	);
	if (known || entry.record) return entry;
	const placeholder: RecordSnapshot = {
		key: entry.key,
		sourceId: entry.key.layerId,
		attributes: {},
		geometry: null,
		navigable: false,
	};
	return { ...entry, record: placeholder };
}
