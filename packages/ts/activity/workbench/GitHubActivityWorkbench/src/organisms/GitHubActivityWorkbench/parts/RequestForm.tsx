import { Icon } from '../../../atoms/Icon';
import { Field } from '../../../molecules/Field';
import { RequestLine } from '../../../molecules/RequestLine';
import type { BuiltRequest, Capability, FieldValue, FieldValues } from '../types';

export interface RequestFormProps {
  cap: Capability;
  values: FieldValues;
  onChange: (name: string, value: FieldValue) => void;
  request: BuiltRequest;
  /** A request is in flight. */
  busy: boolean;
  onSubmit: () => void;
}

/**
 * Render the SDK call signature for a capability. Ids in the `Client` module
 * are already rooted at `client.`; every other module hangs off it.
 */
export function callSignature(id: string): string {
  return id.startsWith('client.') ? `${id}()` : `client.${id}()`;
}

/**
 * Part — the parameter form for the selected capability, the request preview it
 * builds, and the submit control. Submission is delegated: mutating
 * capabilities are routed through a confirmation step by the organism.
 */
export function RequestForm({
  cap,
  values,
  onChange,
  request,
  busy,
  onSubmit,
}: RequestFormProps) {
  const blocked = request.missing.length > 0;

  return (
    <section>
      <h2>{cap.label}</h2>
      <p>
        <code>{callSignature(cap.id)}</code>
      </p>
      {cap.note && <p>{cap.note}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {cap.params.map((param) => (
          <Field
            key={param.name}
            param={param}
            value={values[param.name]}
            onChange={(v) => onChange(param.name, v)}
          />
        ))}

        <RequestLine
          method={cap.method}
          path={request.path}
          qs={request.qs}
          hasBody={request.hasBody}
          body={request.body}
          accept={request.accept}
        />

        {blocked && (
          <p role="alert">Missing required: {request.missing.join(', ')}</p>
        )}

        <button type="submit" disabled={busy || blocked}>
          {busy ? <Icon name="spinner" spin /> : <Icon name="play" />}
          {busy ? 'Sending…' : cap.mutating ? 'Send (mutating)…' : 'Send'}
        </button>
      </form>
    </section>
  );
}
