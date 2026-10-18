import { dismissToast, useUi } from '../lib/ui';
import { Icon } from './Icon';
import { Modal } from './common';

export function ToastHost() {
  const { toasts } = useUi();
  return (
    <div className="toast-host" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone === 'error' ? 'is-error' : ''}`} role={t.tone === 'error' ? 'alert' : 'status'}>
          <span>{t.text}</span>
          <button onClick={() => dismissToast(t.id)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
        </div>
      ))}
    </div>
  );
}

export function ConfirmHost() {
  const { confirm } = useUi();
  if (!confirm) return null;
  return (
    <Modal open onClose={() => confirm.resolve(false)} title={confirm.title} size="sm"
      footer={<>
        <button className="btn btn-ghost" onClick={() => confirm.resolve(false)} data-autofocus>Cancel</button>
        <button className={`btn ${confirm.danger ? 'btn-solid-danger' : 'btn-primary'}`} onClick={() => confirm.resolve(true)} data-testid="confirm-yes">{confirm.confirmLabel}</button>
      </>}>
      {confirm.body && <p className="confirm-body">{confirm.body}</p>}
    </Modal>
  );
}
