import { useState, type FormEvent } from 'react';
import { battlesApi } from '../../api/endpoints';
import type { Battle, UserBrief } from '../../api/types';
import { explain } from '../../lib/apiErrors';
import { BATTLE_ERRORS } from '../../lib/battles';
import { play } from '../../lib/sfx';
import { ErrorNote } from '../ErrorNote';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { PeoplePicker } from '../social/PeoplePicker';
import { PersonAvatar, personName } from '../social/PersonAvatar';
import { OutfitChooser } from './OutfitChooser';

/** Lanzar un reto: a alguien en concreto o abierto a quien quiera. */
export function CreateBattleDialog({ initialOpponent = null, onClose, onCreated }: { initialOpponent?: UserBrief | null; onClose: () => void; onCreated: (b: Battle) => void }) {
  const [outfitId, setOutfitId] = useState<string | null>(null);
  const [mode, setMode] = useState<'open' | 'person'>(initialOpponent ? 'person' : 'open');
  const [opponent, setOpponent] = useState<UserBrief | null>(initialOpponent);
  const [theme, setTheme] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const ready = !!outfitId && (mode === 'open' || !!opponent);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!outfitId || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const b = await battlesApi.create({ outfitId, opponentId: mode === 'person' ? opponent?.id : undefined, theme: theme.trim() || null });
      onCreated(b);
    } catch (err) {
      setError(explain(err, BATTLE_ERRORS));
      play('error');
      setBusy(false);
    }
  }

  return (
    <Modal title="Lanzar un reto" onClose={onClose} wide className="bt-dialog">
      <form className="bt-form" onSubmit={submit}>
        <div className="bt-form-col">
          <span className="wl-label">1 · Tu outfit</span>
          <OutfitChooser value={outfitId} onChange={(o) => setOutfitId(o.id)} />
        </div>
        <div className="bt-form-col">
          <span className="wl-label">2 · Contra quién</span>
          <div className="mk-kind-pick" role="radiogroup" aria-label="Tipo de reto">
            <button type="button" role="radio" aria-checked={mode === 'open'} className={`wl-cat-chip${mode === 'open' ? ' is-active' : ''}`} onClick={() => setMode('open')}>
              <Icon name="flag" size={14} /> Reto abierto
            </button>
            <button type="button" role="radio" aria-checked={mode === 'person'} className={`wl-cat-chip${mode === 'person' ? ' is-active' : ''}`} onClick={() => setMode('person')}>
              <Icon name="users" size={14} /> Retar a alguien
            </button>
          </div>
          {mode === 'open' ? (
            <p className="muted bt-hint">Cualquiera podrá aceptarlo durante 72 h con uno de sus outfits.</p>
          ) : opponent ? (
            <div className="bt-opponent">
              <PersonAvatar person={opponent} size={36} />
              <strong>{personName(opponent)}</strong>
              <button type="button" className="link-btn" onClick={() => setOpponent(null)}>
                Cambiar
              </button>
            </div>
          ) : (
            <PeoplePicker onPick={setOpponent} autoFocus />
          )}

          <label className="field">
            <span className="wl-label">3 · Tema (opcional)</span>
            <input value={theme} maxLength={60} placeholder="Noche de club, todo negro, invierno…" onChange={(e) => setTheme(e.target.value)} />
          </label>

          <p className="wl-form-note">
            <Icon name="users" size={13} /> Tu outfit se verá en público dentro de MyOut mientras dure la batalla. La comunidad vota 48 h; nadie puede votar en su propia batalla.
          </p>
          <ErrorNote error={error} />
          <div className="actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary btn-street" disabled={!ready || busy}>
              <Icon name="bolt" size={14} /> {busy ? 'Lanzando…' : 'Lanzar reto'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Aceptar un reto: eliges el outfit con el que respondes. */
export function AcceptBattleDialog({ battle, onClose, onAccepted }: { battle: Battle; onClose: () => void; onAccepted: (b: Battle) => void }) {
  const [outfitId, setOutfitId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!outfitId) return;
    setBusy(true);
    setError(null);
    try {
      onAccepted(await battlesApi.accept(battle.id, outfitId));
    } catch (err) {
      setError(explain(err, BATTLE_ERRORS));
      play('error');
      setBusy(false);
    }
  }

  return (
    <Modal title={`Responder a ${personName(battle.challenger)}`} onClose={onClose} wide className="bt-dialog">
      <form className="bt-form is-single" onSubmit={submit}>
        {battle.theme && (
          <p className="bt-theme-note">
            <Icon name="bolt" size={14} /> Tema: <b>{battle.theme}</b>
          </p>
        )}
        <OutfitChooser value={outfitId} onChange={(o) => setOutfitId(o.id)} />
        <p className="wl-form-note">
          <Icon name="users" size={13} /> Al aceptar empieza la votación (48 h) y tu outfit se verá en público dentro de MyOut.
        </p>
        <ErrorNote error={error} />
        <div className="actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary btn-street" disabled={!outfitId || busy}>
            <Icon name="bolt" size={14} /> {busy ? 'Aceptando…' : 'Aceptar el reto'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
