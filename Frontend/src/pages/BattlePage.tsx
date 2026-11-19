import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { battlesApi } from '../api/endpoints';
import type { Battle, BattleSide } from '../api/types';
import { garmentsOf } from '../components/battles/BattleCard';
import { AcceptBattleDialog } from '../components/battles/BattleDialogs';
import { ErrorNote } from '../components/ErrorNote';
import { ConfirmDialog } from '../components/fx/ConfirmDialog';
import { SprayLoader } from '../components/fx/SprayLoader';
import { useToast } from '../components/fx/Toast';
import { Icon } from '../components/Icon';
import { PersonAvatar, profilePath } from '../components/social/PersonAvatar';
import { CountUp } from '../components/street/Street';
import { errorText } from '../lib/apiErrors';
import { BATTLE_ERRORS, BATTLE_STATUS, sideName, sidePerson, timeLeft, timeProgress, voteBlockText } from '../lib/battles';
import { useBodyShape } from '../lib/bodyPref';
import { burst, burstAt, reducedMotion } from '../lib/motion';
import { play } from '../lib/sfx';
import { OutfitView } from '../three/OutfitMannequin';
import { t } from '../i18n';

/** Cada cuánto se refresca el marcador mientras se vota. */
const REFRESH_MS = 20_000;

/**
 * Una batalla: los dos outfits frente a frente, el choque «VS» al entrar, el
 * voto (uno por persona, nunca en tu batalla), el marcador animado y la
 * celebración del ganador.
 */
export function BattlePage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const [b, setB] = useState<Battle | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [confirm, setConfirm] = useState<'cancel' | 'decline' | null>(null);
  const [justVoted, setJustVoted] = useState<BattleSide | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const celebrated = useRef<string | null>(null);
  const arena = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    battlesApi
      .get(id)
      .then((x) => {
        setB(x);
        setError(null);
      })
      .catch((e: unknown) => setError(e));
  }, [id]);
  useEffect(load, [load]);

  // Marcador y cuenta atrás en vivo mientras se vota.
  const live = b?.status === 'ACTIVE';
  useEffect(() => {
    if (!live) return;
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    const refresh = window.setInterval(load, REFRESH_MS);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(refresh);
    };
  }, [live, load]);

  // Celebración: al ver una batalla terminada con ganador (una vez por batalla).
  useEffect(() => {
    if (!b || b.status !== 'FINISHED' || celebrated.current === b.id || reducedMotion()) return;
    celebrated.current = b.id;
    const el = arena.current?.querySelector(b.winner ? `.bt-side.is-${b.winner.toLowerCase()}` : '.bt-vs');
    if (!el) return;
    const timers = [350, 750, 1150].map((t, i) =>
      window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        burst(r.left + r.width * (0.3 + 0.2 * i), r.top + r.height * 0.3, { count: 18, spread: 120 });
      }, t),
    );
    if (b.winner && b.mySide === b.winner) play('success');
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [b]);

  if (!b) {
    return (
      <section className="page bt bt-item ux ba">
        <Link to="/batallas" className="wl-back">
          <Icon name="back" size={14} /> {t('Batallas')}
        </Link>
        <ErrorNote error={error} />
        {!error && <SprayLoader label={t('Subiendo al ring…')} />}
      </section>
    );
  }

  async function vote(side: BattleSide, el: HTMLElement) {
    if (!b) return;
    setBusy(true);
    try {
      const u = await battlesApi.vote(b.id, side);
      burstAt(el, { count: 16, spread: 80 });
      play('pop');
      setJustVoted(side);
      setB(u);
    } catch (err) {
      toast.show(errorText(err, BATTLE_ERRORS, t('No se pudo votar')), { tone: 'danger', sound: 'error' });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function act(kind: 'cancel' | 'decline') {
    if (!b) return;
    setBusy(true);
    try {
      if (kind === 'cancel') {
        await battlesApi.cancel(b.id);
        toast.show(t('Reto retirado'), { tone: 'info' });
        load();
      } else {
        setB(await battlesApi.decline(b.id));
        toast.show(t('Reto rechazado'), { tone: 'info' });
      }
      play('swoosh');
    } catch (err) {
      toast.show(errorText(err, BATTLE_ERRORS, t('No se pudo hacer')), { tone: 'danger', sound: 'error' });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const st = BATTLE_STATUS[b.status];
  const left = b.status === 'ACTIVE' ? timeLeft(b.endsAt, now) : b.status === 'PENDING' ? timeLeft(b.expiresAt, now) : null;
  const progress = timeProgress(b.startedAt, b.endsAt, now);
  const blockText = voteBlockText(b);
  const finished = b.status === 'FINISHED';

  return (
    <section className={`page bt bt-item ux ba is-${st.tone}`}>
      <Link to="/batallas" className="wl-back">
        <Icon name="back" size={14} /> {t('Batallas')}
      </Link>

      <header className="bt-item-head ux-head">
        <span className="wd-kicker">
          <Icon name="bolt" size={12} /> {t('Streetwear battle')}
        </span>
        <span className={`bt-status is-${st.tone}`}>
          {st.tone === 'live' && <i className="bt-live-dot" aria-hidden="true" />}
          {st.label}
        </span>
        <h1 className="wd-title ux-title" data-text={b.theme ? `«${b.theme}»` : t('Streetwear Battle')}>
          {b.theme ? `«${b.theme}»` : t('Streetwear Battle')}
        </h1>
        {left && <span className="bt-left">{left}</span>}
        {b.status === 'ACTIVE' && (
          <div className="bt-time" role="progressbar" aria-label={t('Tiempo de votación')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </header>

      <div ref={arena} className={`bt-arena is-big${finished ? ' is-finished' : ''}${finished && !b.winner ? ' is-tie' : ''}`}>
        <BigSide battle={b} side="A" busy={busy} justVoted={justVoted === 'A'} onVote={vote} />
        <div className="bt-vs-wrap" aria-hidden="true">
          <span className="bt-vs is-big">{t('VS')}</span>
          <span className="bt-shock" />
        </div>
        <BigSide battle={b} side="B" busy={busy} justVoted={justVoted === 'B'} onVote={vote} />
      </div>

      {(b.status === 'ACTIVE' || finished) && (
        <div className="bt-score">
          {b.votes ? (
            <div className="bt-bar is-big" style={{ '--a': `${b.votes.shareA}%` } as CSSProperties}>
              <span className="bt-bar-a" />
              <span className="bt-bar-b" />
              <b className="bt-bar-na">
                <CountUp value={b.votes.a} duration={700} />
              </b>
              <b className="bt-bar-nb">
                <CountUp value={b.votes.b} duration={700} />
              </b>
            </div>
          ) : (
            <p className="bt-score-hidden">
              <Icon name="lock" size={14} /> {t('{totalVotes} {v} hasta ahora. El marcador se ve cuando votas.', { totalVotes: b.totalVotes, v: b.totalVotes === 1 ? t('voto') : t('votos') })}
            </p>
          )}
          {finished && (
            <p className="bt-result">
              {b.winner ? (
                <>
                  <Icon name="trophy" size={16} /> {t('Gana')} <b>{sideName(b, b.winner)}</b>
                  {b.mySide === b.winner ? t(' · ¡Enhorabuena!') : ''}
                </>
              ) : (
                t('Empate: mismos votos para los dos outfits.')
              )}
            </p>
          )}
          {blockText && !finished && <p className="muted bt-block">{blockText}</p>}
        </div>
      )}

      {b.status === 'PENDING' && (
        <div className="bt-pending panel">
          <p>
            {b.mySide === 'A'
              ? b.isOpen
                ? t('Tu reto está abierto: cualquiera puede aceptarlo con su outfit.')
                : t('Esperando a que {sideName} responda.', { sideName: sideName(b, 'B') })
              : b.isOpen
                ? t('{sideName} busca rival. Acepta con uno de tus outfits.', { sideName: sideName(b, 'A') })
                : t('{sideName} te reta. Responde con uno de tus outfits.', { sideName: sideName(b, 'A') })}{' '}
            {left && <span className="muted">{t('({left} para aceptar)', { left })}</span>}
          </p>
          <div className="actions">
            {b.canAccept && (
              <button type="button" className="btn wd-add" onClick={() => setAccepting(true)}>
                <Icon name="bolt" size={14} /> <span>{t('Aceptar el reto')}</span>
              </button>
            )}
            {b.canDecline && (
              <button type="button" className="btn wd-btn-line" disabled={busy} onClick={() => setConfirm('decline')}>
                {t('Rechazar')}
              </button>
            )}
            {b.canCancel && (
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setConfirm('cancel')}>
                {t('Retirar reto')}
              </button>
            )}
          </div>
        </div>
      )}

      {(b.status === 'DECLINED' || b.status === 'CANCELLED' || b.status === 'EXPIRED') && (
        <p className="bt-off panel">
          {b.status === 'DECLINED' ? t('El reto fue rechazado.') : b.status === 'CANCELLED' ? t('El reto se retiró.') : t('Nadie aceptó el reto a tiempo.')}{' '}
          <Link to="/batallas">{t('Volver a las batallas')}</Link>
        </p>
      )}

      {accepting && (
        <AcceptBattleDialog
          battle={b}
          onClose={() => setAccepting(false)}
          onAccepted={(u) => {
            setAccepting(false);
            setB(u);
            play('success');
            toast.show(t('¡Reto aceptado! Empieza la votación'), { tone: 'ok', icon: 'bolt' });
            window.setTimeout(() => burstAt(arena.current?.querySelector('.bt-vs'), { count: 22, spread: 140 }), 200);
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm === 'cancel' ? t('¿Retirar el reto?') : t('¿Rechazar el reto?')}
          confirmLabel={confirm === 'cancel' ? t('Retirar') : t('Rechazar')}
          danger
          busy={busy}
          onConfirm={() => void act(confirm)}
          onClose={() => setConfirm(null)}
        >
          {confirm === 'cancel' ? t('Nadie podrá aceptarlo ya.') : t('{sideName} verá que has dicho que no.', { sideName: sideName(b, 'A') })}
        </ConfirmDialog>
      )}
    </section>
  );
}

function BigSide({
  battle,
  side,
  busy,
  justVoted,
  onVote,
}: {
  battle: Battle;
  side: BattleSide;
  busy: boolean;
  justVoted: boolean;
  onVote: (side: BattleSide, el: HTMLElement) => void;
}) {
  const { shape } = useBodyShape();
  const outfit = side === 'A' ? battle.outfitA : battle.outfitB;
  const garments = useMemo(() => garmentsOf(outfit), [outfit]);
  const person = sidePerson(battle, side);
  const finished = battle.status === 'FINISHED';
  const won = finished && battle.winner === side;
  const lost = finished && battle.winner !== null && battle.winner !== side;
  const mine = battle.mySide === side;
  const myVote = battle.myVote === side;
  return (
    <div className={`bt-side is-${side.toLowerCase()}${won ? ' is-winner' : ''}${lost ? ' is-loser' : ''}${myVote ? ' is-voted' : ''}`}>
      <div className="bt-side-stage">
        {outfit ? (
          <OutfitView className="tile-view" garments={garments} shape={shape} active distance={4.2} />
        ) : (
          <span className="bt-side-empty" aria-hidden="true">
            ?
          </span>
        )}
        {won && (
          <span className="bt-crown is-big" aria-label={t('Ganador')}>
            <Icon name="crown" size={26} />
          </span>
        )}
        {justVoted && (
          <span className="bt-plus" aria-hidden="true">
            +1
          </span>
        )}
      </div>
      <div className="bt-side-info">
        {person ? (
          <Link to={profilePath(person)} className="bt-side-who">
            <PersonAvatar person={person} size={30} />
            <span>{sideName(battle, side)}</span>
          </Link>
        ) : (
          <span className="bt-side-who">
            <span className="bt-side-dot" />
            <span>{t('Rival por llegar')}</span>
          </span>
        )}
        {outfit && <small className="muted">{outfit.name}</small>}
        {mine && <span className="bt-tag">{t('Tú')}</span>}
        {myVote && (
          <span className="bt-tag is-vote">
            <Icon name="check" size={11} /> {t('Tu voto')}
          </span>
        )}
      </div>
      {battle.canVote && outfit && (
        <button type="button" className="btn wd-add bt-vote" disabled={busy} onClick={(e) => onVote(side, e.currentTarget)}>
          <Icon name="bolt" size={14} /> {t('Votar este')}
        </button>
      )}
    </div>
  );
}
