import { RequestLine } from '../../../molecules/RequestLine';
import type { BuiltRequest, Capability } from '../types';

export interface ConfirmDialogProps {
  /** Always a `mutating` capability — the organism gates on that before rendering. */
  cap: Capability;
  request: BuiltRequest;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Part — the interstitial guard in front of a mutating request. Shows the exact
 * request about to be sent so the write is never a surprise.
 */
export function ConfirmDialog({ cap, request, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <div role="dialog" aria-modal="true" aria-label={`Confirm ${cap.label}`}>
      <h2>Confirm {cap.label}</h2>
      <p>This is a mutating request against the live API. Review it before sending.</p>

      <RequestLine
        method={cap.method}
        path={request.path}
        qs={request.qs}
        hasBody={request.hasBody}
        body={request.body}
        accept={request.accept}
      />

      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" onClick={onConfirm}>
        Send request
      </button>
    </div>
  );
}
