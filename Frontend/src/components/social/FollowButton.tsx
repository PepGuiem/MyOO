import { useState } from 'react';
import { ApiError } from '../../api/client';
import { peopleApi } from '../../api/endpoints';
import type { FollowState } from '../../api/types';
import { Busy } from '../Spinner';

/**
 * Seguir / Solicitado / Siguiendo. En una cuenta privada, seguir envía una
 * solicitud; volver a pulsar la cancela. «Siguiendo» pide confirmar.
 */
export function FollowButton({
  userId,
  state,
  followsYou = false,
  onChange,
  small = false,
}: {
  userId: string;
  state: FollowState;
  followsYou?: boolean;
  onChange: (state: FollowState) => void;
  small?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function click() {
    setError(null);
    if (state === 'accepted' && !confirm) {
      setConfirm(true);
      window.setTimeout(() => setConfirm(false), 3000);
      return;
    }
    setBusy(true);
    try {
      if (state === 'none') onChange((await peopleApi.follow(userId)).status);
      else {
        await peopleApi.unfollow(userId);
        onChange('none');
      }
      setConfirm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido.');
    } finally {
      setBusy(false);
    }
  }

  const label =
    state === 'none' ? (followsYou ? 'Seguir también' : 'Seguir') : state === 'pending' ? 'Solicitado' : confirm ? 'Dejar de seguir' : 'Siguiendo';
  return (
    <span className="follow-btn-wrap">
      <button
        type="button"
        className={`btn${small ? ' btn-small' : ''}${state === 'none' ? ' btn-primary' : ''}${confirm ? ' btn-danger' : ''}`}
        disabled={busy}
        aria-pressed={state !== 'none'}
        title={state === 'pending' ? 'Pulsa para cancelar la solicitud' : undefined}
        onClick={click}
      >
        {busy ? <Busy text="…" /> : label}
      </button>
      {error && (
        <small className="danger-text" role="alert">
          {error}
        </small>
      )}
    </span>
  );
}
