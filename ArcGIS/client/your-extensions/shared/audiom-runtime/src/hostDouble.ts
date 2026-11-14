import {
	type ActivationKind,
	type AppliedResult,
	type AvatarState,
	type CanonicalKey,
	type ContractError,
	type FocusResult,
	type RuntimeHost,
	type SelectionOp,
	type SelectionResult,
	type Viewpoint,
} from './types';

export class MemoryRuntimeHost implements RuntimeHost {
	avatar: AvatarState[] = [];
	viewpoints: Viewpoint[] = [];
	entered: CanonicalKey[][] = [];
	exited: CanonicalKey[][] = [];
	statuses: string[] = [];
	errors: ContractError[] = [];
	activations: ActivationKind[] = [];
	focusWithin: boolean[] = [];
	selectionRevision = 1;
	rejectNextSelection = false;

	onAvatarChanged(state: AvatarState): Promise<AppliedResult> {
		this.avatar.push(state);
		return Promise.resolve({ applied: true, revision: this.selectionRevision });
	}

	requestSelection(
		_op: SelectionOp,
		_keys: CanonicalKey[],
		baseRevision: number,
	): Promise<SelectionResult> {
		if (this.rejectNextSelection || baseRevision !== this.selectionRevision) {
			this.rejectNextSelection = false;
			return Promise.resolve({
				accepted: false,
				revision: this.selectionRevision,
				reason: 'revision mismatch',
			});
		}
		this.selectionRevision += 1;
		return Promise.resolve({
			accepted: true,
			revision: this.selectionRevision,
		});
	}

	requestViewpoint(viewpoint: Viewpoint): Promise<AppliedResult> {
		this.viewpoints.push(viewpoint);
		return Promise.resolve({ applied: true, revision: this.selectionRevision });
	}

	requestHostFocus(): Promise<FocusResult> {
		return Promise.resolve({ focused: true, blocked: false });
	}

	onFocusChanged(within: boolean): Promise<AppliedResult> {
		this.focusWithin.push(within);
		return Promise.resolve({ applied: true, revision: 0 });
	}

	onActivationRequired(kind: ActivationKind): Promise<AppliedResult> {
		this.activations.push(kind);
		return Promise.resolve({ applied: true, revision: 0 });
	}

	onFeatureEntered(keys: CanonicalKey[]): Promise<AppliedResult> {
		this.entered.push(keys);
		return Promise.resolve({ applied: true, revision: 0 });
	}

	onFeatureExited(keys: CanonicalKey[]): Promise<AppliedResult> {
		this.exited.push(keys);
		return Promise.resolve({ applied: true, revision: 0 });
	}

	onRuntimeStatus(status: string): Promise<AppliedResult> {
		this.statuses.push(status);
		return Promise.resolve({ applied: true, revision: 0 });
	}

	onRuntimeError(error: ContractError): Promise<AppliedResult> {
		this.errors.push(error);
		return Promise.resolve({ applied: true, revision: 0 });
	}
}
