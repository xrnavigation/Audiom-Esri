/** Contract version. Compatible when majors match and the host minor is not newer. */
export const CONTRACT_VERSION = '1.0';

export const MAX_PAYLOAD_BYTES = 50_000_000;

export enum ContractErrorCode {
	Stale = 'stale',
	SessionReset = 'sessionReset',
	Timeout = 'timeout',
	TooLarge = 'tooLarge',
	IncompatibleVersion = 'incompatibleVersion',
	RuntimeUnreachable = 'runtimeUnreachable',
	NotInUniverse = 'notInUniverse',
	ActivationRequired = 'activationRequired',
	Invalid = 'invalid',
}

export enum GeometryFamily {
	Point = 'Point',
	MultiPoint = 'MultiPoint',
	LineString = 'LineString',
	MultiLineString = 'MultiLineString',
	Polygon = 'Polygon',
	MultiPolygon = 'MultiPolygon',
}

export enum LayerDisposition {
	Bound = 'bound',
	VisualOnly = 'visual-only',
	Unsupported = 'unsupported',
}

export enum SelectionOp {
	Replace = 'replace',
	Add = 'add',
	Remove = 'remove',
	Clear = 'clear',
}

export enum FocusTarget {
	Map = 'map',
	Controls = 'controls',
}

export enum WidgetLifecycle {
	Opened = 'Opened',
	Closed = 'Closed',
	Hidden = 'Hidden',
}

export enum SourceStatus {
	Complete = 'complete',
	Failed = 'failed',
}

export enum ActivationKind {
	Audio = 'audio',
	Device = 'device',
}

export interface ContractError {
	code: ContractErrorCode;
	message: string;
	currentRevision?: number;
}

export interface HostInfo {
	product: string;
	version: string;
	contractVersion: string;
	capabilities: string[];
}

export interface RuntimeHello {
	contractVersion: string;
	capabilities: string[];
}

export interface CanonicalKey {
	dataSourceId: string;
	layerId: string;
	recordId: string;
}

export interface LngLat {
	longitude: number;
	latitude: number;
}

export interface SourceSnapshot {
	sourceId: string;
	displayName: string;
	geometryFamily: GeometryFamily | null;
	mapType: string;
	rulesRef: string | null;
	disposition: LayerDisposition;
	recordCount: number;
	status: SourceStatus;
	reason?: string;
}

export interface RecordSnapshot {
	key: CanonicalKey;
	sourceId: string;
	attributes: Record<string, string | number | boolean | null>;
	geometry: SerializedGeometry | null;
	navigable: boolean;
}

export interface SerializedGeometry {
	type: GeometryFamily;
	coordinates: number[] | number[][] | number[][][] | number[][][][];
}

export interface MapSnapshot {
	sources: SourceSnapshot[];
	records: RecordSnapshot[];
}

export interface EffectiveState {
	scaleAvailable: boolean;
	sourceAvailable: boolean;
	floor: string | null;
	time: string | null;
}

export interface SelectionEntry {
	key: CanonicalKey;
	record?: RecordSnapshot;
}

export interface AvatarState {
	position: LngLat;
	orientation: number;
	visualState: string;
}

export interface Viewpoint {
	center: LngLat;
	heading: number;
	zoom?: number;
}

export interface SelectionResult {
	accepted: boolean;
	revision: number;
	reason?: string;
}

export interface FocusResult {
	focused: boolean;
	blocked: boolean;
}

export interface AppliedResult {
	applied: true;
	revision: number;
}

export interface Envelope<T> {
	sessionId: string;
	hostViewGeneration: number;
	sequence: number;
	revision?: number;
	payload: T;
}

export interface RuntimeHost {
	onAvatarChanged(state: AvatarState): Promise<AppliedResult>;
	requestSelection(
		op: SelectionOp,
		keys: CanonicalKey[],
		baseRevision: number,
	): Promise<SelectionResult>;
	requestViewpoint(viewpoint: Viewpoint): Promise<AppliedResult>;
	requestHostFocus(target: FocusTarget.Map): Promise<FocusResult>;
	onFocusChanged(within: boolean): Promise<AppliedResult>;
	onActivationRequired(kind: ActivationKind): Promise<AppliedResult>;
	onFeatureEntered(keys: CanonicalKey[]): Promise<AppliedResult>;
	onFeatureExited(keys: CanonicalKey[]): Promise<AppliedResult>;
	onRuntimeStatus(status: string): Promise<AppliedResult>;
	onRuntimeError(error: ContractError): Promise<AppliedResult>;
}

export interface AudiomRuntime {
	hello(hostInfo: HostInfo): Promise<RuntimeHello>;
	describeSource(
		rulesRef: string,
		mapType: string,
	): Promise<{ fields: string[] }>;
	replaceSources(
		snapshot: MapSnapshot,
		stateRevision: number,
	): Promise<AppliedResult>;
	setEffectiveState(
		state: EffectiveState,
		stateRevision: number,
	): Promise<AppliedResult>;
	setHostSelection(
		op: SelectionOp,
		entries: SelectionEntry[],
		selectionRevision: number,
	): Promise<AppliedResult>;
	openFeatureContent(key: CanonicalKey): Promise<AppliedResult>;
	restoreAvatar(position: LngLat, orientation: number): Promise<AppliedResult>;
	focusRuntime(target: FocusTarget): Promise<FocusResult>;
	setHostLifecycle(
		widgetState: WidgetLifecycle,
		viewState: string,
		authState: string,
	): Promise<AppliedResult>;
	reportHostError(error: ContractError): Promise<AppliedResult>;
	dispose(): Promise<AppliedResult>;
}
