import { ValidationError } from '../../shared/errors.js';
import { integer, stringifyJson } from '../wire-format.js';

function snapshotTime(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ValidationError('snapshotAtMs must be a positive safe integer.');
  return value;
}

export class SyncState {
  #sequence = null;
  #snapshot = null;

  constructor({ lastSeqId = null, snapshotAtMs = null } = {}) {
    this.lastSeqId = lastSeqId;
    if (snapshotAtMs !== null) this.#snapshot = snapshotTime(snapshotAtMs);
  }

  get lastSeqId() { return this.#sequence; }
  set lastSeqId(value) { this.#sequence = value === null ? null : integer(value, 'lastSeqId').toString(); }
  get snapshotAtMs() { return this.#snapshot; }
  get needsBootstrap() { return this.#sequence === null || this.#snapshot === null; }

  setBootstrap({ sequenceId, snapshotAtMs }, { reset = false } = {}) {
    const sequence = integer(sequenceId, 'sequenceId').toString();
    const snapshot = snapshotTime(snapshotAtMs);
    if (reset || this.#sequence === null) this.#sequence = sequence;
    this.#snapshot = snapshot;
  }

  buildSubscription() {
    if (this.needsBootstrap) throw new ValidationError('Iris subscription requires an inbox cursor and snapshot timestamp.');
    return {
      topic: '/ig_sub_iris',
      payload: stringifyJson({
        seq_id: integer(this.#sequence, 'lastSeqId'), snapshot_at_ms: this.#snapshot,
        snapshot_app_version: 'web', subscription_type: 'message',
      }),
    };
  }

  apply(envelope) {
    const sequence = integer(envelope.sequence, 'Iris sequence').toString();
    if (this.#sequence !== null && BigInt(sequence) <= BigInt(this.#sequence)) return false;
    this.#sequence = sequence;
    return true;
  }
}
