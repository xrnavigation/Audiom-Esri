import {
	ActivationKind,
	ContractErrorCode,
	FocusTarget,
	GeometryFamily,
	LayerDisposition,
	SelectionOp,
	SourceStatus,
	WidgetLifecycle,
} from './types';

/** JSON schema for the published contract messages. Consumers can validate without loading the runtime. */
const lngLat = {
	type: 'object',
	required: ['longitude', 'latitude'],
	properties: {
		longitude: { type: 'number' },
		latitude: { type: 'number' },
	},
	additionalProperties: false,
} as const;

const canonicalKey = {
	type: 'object',
	required: ['dataSourceId', 'layerId', 'recordId'],
	properties: {
		dataSourceId: { type: 'string' },
		layerId: { type: 'string' },
		recordId: { type: 'string' },
	},
	additionalProperties: false,
} as const;

const errorCodes = Object.values(ContractErrorCode);
const geometryFamilies = Object.values(GeometryFamily);

export const contractJsonSchema = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	$id: 'https://audiom.app/schemas/runtime-contract-1.0.json',
	title: 'AudiomRuntime contract',
	type: 'object',
	required: ['sessionId', 'hostViewGeneration', 'sequence', 'payload'],
	properties: {
		sessionId: { type: 'string', minLength: 1 },
		hostViewGeneration: { type: 'integer', minimum: 0 },
		sequence: { type: 'integer', minimum: 1 },
		revision: { type: 'integer', minimum: 0 },
		payload: { type: ['object', 'array', 'string', 'number', 'boolean', 'null'] },
	},
	additionalProperties: false,
	$defs: {
		errorCodes: { enum: [...errorCodes] },
		contractError: {
			type: 'object',
			required: ['code', 'message'],
			properties: {
				code: { enum: [...errorCodes] },
				message: { type: 'string' },
				currentRevision: { type: 'integer' },
			},
			additionalProperties: false,
		},
		appliedResult: {
			type: 'object',
			required: ['applied', 'revision'],
			properties: {
				applied: { const: true },
				revision: { type: 'integer', minimum: 0 },
			},
			additionalProperties: false,
		},
		selectionResult: {
			type: 'object',
			required: ['accepted', 'revision'],
			properties: {
				accepted: { type: 'boolean' },
				revision: { type: 'integer', minimum: 0 },
				reason: { type: 'string' },
			},
			additionalProperties: false,
		},
		focusResult: {
			type: 'object',
			required: ['focused', 'blocked'],
			properties: {
				focused: { type: 'boolean' },
				blocked: { type: 'boolean' },
			},
			additionalProperties: false,
		},
		hostInfo: {
			type: 'object',
			required: ['product', 'version', 'contractVersion', 'capabilities'],
			properties: {
				product: { type: 'string' },
				version: { type: 'string' },
				contractVersion: { type: 'string', pattern: '^\\d+\\.\\d+$' },
				capabilities: { type: 'array', items: { type: 'string' } },
			},
			additionalProperties: false,
		},
		runtimeHello: {
			type: 'object',
			required: ['contractVersion', 'capabilities'],
			properties: {
				contractVersion: { type: 'string', pattern: '^\\d+\\.\\d+$' },
				capabilities: { type: 'array', items: { type: 'string' } },
			},
			additionalProperties: false,
		},
		sourceSnapshot: {
			type: 'object',
			required: [
				'sourceId',
				'displayName',
				'geometryFamily',
				'mapType',
				'rulesRef',
				'disposition',
				'recordCount',
				'status',
			],
			properties: {
				sourceId: { type: 'string' },
				displayName: { type: 'string' },
				geometryFamily: {
					enum: [...geometryFamilies, null],
				},
				mapType: { type: 'string' },
				rulesRef: { type: ['string', 'null'] },
				disposition: { enum: Object.values(LayerDisposition) },
				recordCount: { type: 'integer', minimum: 0 },
				status: { enum: Object.values(SourceStatus) },
				reason: { type: 'string' },
			},
			additionalProperties: false,
		},
		recordSnapshot: {
			type: 'object',
			required: ['key', 'sourceId', 'attributes', 'geometry', 'navigable'],
			properties: {
				key: canonicalKey,
				sourceId: { type: 'string' },
				attributes: { type: 'object' },
				geometry: {
					type: ['object', 'null'],
					required: ['type', 'coordinates'],
					properties: {
						type: { enum: geometryFamilies },
						coordinates: {},
					},
					additionalProperties: false,
				},
				navigable: { type: 'boolean' },
			},
			additionalProperties: false,
		},
		mapSnapshot: {
			type: 'object',
			required: ['sources', 'records'],
			properties: {
				sources: { type: 'array', items: { $ref: '#/$defs/sourceSnapshot' } },
				records: { type: 'array', items: { $ref: '#/$defs/recordSnapshot' } },
			},
			additionalProperties: false,
		},
		effectiveState: {
			type: 'object',
			required: ['scaleAvailable', 'sourceAvailable', 'floor', 'time'],
			properties: {
				scaleAvailable: { type: 'boolean' },
				sourceAvailable: { type: 'boolean' },
				floor: { type: ['string', 'null'] },
				time: { type: ['string', 'null'] },
			},
			additionalProperties: false,
		},
		selectionEntry: {
			type: 'object',
			required: ['key'],
			properties: {
				key: canonicalKey,
				record: { $ref: '#/$defs/recordSnapshot' },
			},
			additionalProperties: false,
		},
		avatarState: {
			type: 'object',
			required: ['position', 'orientation', 'visualState'],
			properties: {
				position: lngLat,
				orientation: { type: 'number' },
				visualState: { type: 'string' },
			},
			additionalProperties: false,
		},
		viewpoint: {
			type: 'object',
			required: ['center', 'heading'],
			properties: {
				center: lngLat,
				heading: { type: 'number' },
				zoom: { type: 'number' },
			},
			additionalProperties: false,
		},
		messages: {
			type: 'object',
			required: [
				'hello',
				'describeSource',
				'replaceSources',
				'setEffectiveState',
				'setHostSelection',
				'openFeatureContent',
				'moveAvatar',
				'restoreAvatar',
				'focusRuntime',
				'setHostLifecycle',
				'reportHostError',
				'onAvatarChanged',
				'requestSelection',
				'requestViewpoint',
				'requestHostFocus',
				'onFocusChanged',
				'onActivationRequired',
				'onFeatureEntered',
				'onFeatureExited',
				'onRuntimeStatus',
				'onRuntimeError',
			],
			properties: {
				hello: { $ref: '#/$defs/hostInfo' },
				describeSource: {
					type: 'object',
					required: ['rulesRef', 'mapType'],
					properties: {
						rulesRef: { type: 'string' },
						mapType: { type: 'string' },
					},
					additionalProperties: false,
				},
				replaceSources: { $ref: '#/$defs/mapSnapshot' },
				setEffectiveState: { $ref: '#/$defs/effectiveState' },
				setHostSelection: {
					type: 'object',
					required: ['op', 'entries'],
					properties: {
						op: { enum: Object.values(SelectionOp) },
						entries: { type: 'array', items: { $ref: '#/$defs/selectionEntry' } },
					},
					additionalProperties: false,
				},
				openFeatureContent: canonicalKey,
				moveAvatar: { type: 'string' },
				restoreAvatar: {
					type: 'object',
					required: ['position', 'orientation'],
					properties: {
						position: lngLat,
						orientation: { type: 'number' },
					},
					additionalProperties: false,
				},
				focusRuntime: { enum: Object.values(FocusTarget) },
				setHostLifecycle: {
					type: 'object',
					required: ['widgetState', 'viewState', 'authState'],
					properties: {
						widgetState: { enum: Object.values(WidgetLifecycle) },
						viewState: { type: 'string' },
						authState: { type: 'string' },
					},
					additionalProperties: false,
				},
				reportHostError: { $ref: '#/$defs/contractError' },
				onAvatarChanged: { $ref: '#/$defs/avatarState' },
				requestSelection: {
					type: 'object',
					required: ['op', 'keys', 'baseRevision'],
					properties: {
						op: { enum: Object.values(SelectionOp) },
						keys: { type: 'array', items: canonicalKey },
						baseRevision: { type: 'integer', minimum: 0 },
					},
					additionalProperties: false,
				},
				requestViewpoint: { $ref: '#/$defs/viewpoint' },
				requestHostFocus: { const: FocusTarget.Map },
				onFocusChanged: { type: 'boolean' },
				onActivationRequired: { enum: Object.values(ActivationKind) },
				onFeatureEntered: { type: 'array', items: canonicalKey },
				onFeatureExited: { type: 'array', items: canonicalKey },
				onRuntimeStatus: { type: 'string' },
				onRuntimeError: { $ref: '#/$defs/contractError' },
			},
			additionalProperties: false,
		},
		results: {
			type: 'object',
			required: ['applied', 'selection', 'focus', 'hello', 'fields'],
			properties: {
				applied: { $ref: '#/$defs/appliedResult' },
				selection: { $ref: '#/$defs/selectionResult' },
				focus: { $ref: '#/$defs/focusResult' },
				hello: { $ref: '#/$defs/runtimeHello' },
				fields: {
					type: 'object',
					required: ['fields'],
					properties: { fields: { type: 'array', items: { type: 'string' } } },
					additionalProperties: false,
				},
			},
			additionalProperties: false,
		},
	},
} as const;

export const CONTRACT_MESSAGE_NAMES = Object.keys(
	contractJsonSchema.$defs.messages.properties,
);

export const CONTRACT_RESULT_NAMES = Object.keys(
	contractJsonSchema.$defs.results.properties,
);
