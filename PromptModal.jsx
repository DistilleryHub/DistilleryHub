import { useCallback, useState } from 'react';

/**
 * Replaces window.confirm()/window.prompt() with dialogs that actually match
 * the app's theme. Native confirm/prompt render as the browser's own
 * "distilleryhub.github.io says" box — always dark-on-black with stark
 * white OK/Cancel text no matter what theme the app is in, which is why it
 * looked broken/unbranded and hard to read compared to the rest of the UI.
 *
 * Usage inside any component:
 *   const { confirmDialog, formDialog, choiceDialog, modalElement } = usePromptModal();
 *   const ok = await confirmDialog('Delete this message for everyone?');
 *   const values = await formDialog('New event', [{ key: 'title', label: 'Event title' }]);
 *   const pick = await choiceDialog('Send as View Once?', [
 *     { key: 'once', label: 'View Once' },
 *     { key: 'normal', label: 'Send Normally', primary: true },
 *   ]);
 *   // ...render {modalElement} once, anywhere in the component's JSX...
 */
export function usePromptModal() {
  const [state, setState] = useState(null);

  const confirmDialog = useCallback((message, opts = {}) => new Promise((resolve) => {
    setState({ kind: 'confirm', message, resolve, confirmLabel: opts.confirmLabel || 'OK', cancelLabel: opts.cancelLabel || 'Cancel', danger: opts.danger });
  }), []);

  const formDialog = useCallback((title, fields) => new Promise((resolve) => {
    const initial = {};
    fields.forEach((f) => { initial[f.key] = f.defaultValue || ''; });
    setState({ kind: 'form', title, fields, values: initial, resolve });
  }), []);

  const choiceDialog = useCallback((message, choices) => new Promise((resolve) => {
    setState({ kind: 'choice', message, choices, resolve });
  }), []);

  const noticeDialog = useCallback((message, opts = {}) => new Promise((resolve) => {
    setState({ kind: 'notice', message, resolve, okLabel: opts.okLabel || 'OK' });
  }), []);

  function respond(result) {
    if (state?.resolve) state.resolve(result);
    setState(null);
  }

  const modalElement = state ? (
    <PromptModalUI state={state} setState={setState} onRespond={respond} />
  ) : null;

  return { confirmDialog, formDialog, choiceDialog, noticeDialog, modalElement };
}

function PromptModalUI({ state, setState, onRespond }) {
  function updateField(key, value) {
    setState((s) => ({ ...s, values: { ...s.values, [key]: value } }));
  }

  function submitForm(e) {
    e.preventDefault();
    onRespond(state.values);
  }

  return (
    <div className="modal-overlay" onClick={() => onRespond(state.kind === 'form' ? null : (state.kind === 'choice' ? null : (state.kind === 'notice' ? true : false)))}>
      <div className="card" style={{ maxWidth: 380, margin: '18vh auto 0', padding: 20 }} onClick={(e) => e.stopPropagation()}>
        {state.kind === 'notice' && (
          <>
            <p style={{ margin: '0 0 18px', fontSize: 14.5, lineHeight: 1.5 }}>{state.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onRespond(true)}>{state.okLabel}</button>
            </div>
          </>
        )}

        {state.kind === 'confirm' && (
          <>
            <p style={{ margin: '0 0 18px', fontSize: 14.5, lineHeight: 1.5 }}>{state.message}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRespond(false)}>{state.cancelLabel}</button>
              <button
                type="button"
                className={'btn btn-sm ' + (state.danger ? 'btn-danger' : 'btn-primary')}
                onClick={() => onRespond(true)}
              >
                {state.confirmLabel}
              </button>
            </div>
          </>
        )}

        {state.kind === 'choice' && (
          <>
            <p style={{ margin: '0 0 18px', fontSize: 14.5, lineHeight: 1.5 }}>{state.message}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {state.choices.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={'btn btn-sm btn-block ' + (c.primary ? 'btn-primary' : 'btn-ghost')}
                  onClick={() => onRespond(c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </>
        )}

        {state.kind === 'form' && (
          <form onSubmit={submitForm}>
            <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>{state.title}</h3>
            {state.fields.map((f) => (
              <div className="form-field" key={f.key} style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', marginBottom: 4 }}>{f.label}</label>
                <input
                  type="text"
                  autoFocus={f === state.fields[0]}
                  placeholder={f.placeholder || ''}
                  value={state.values[f.key]}
                  onChange={(e) => updateField(f.key, e.target.value)}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRespond(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm">Save</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
