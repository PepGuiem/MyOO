import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Battle, BattleSide, SharedOutfit } from '../../api/types';
import { BATTLE_STATUS, sideName, sidePerson, timeLeft } from '../../lib/battles';
import { useBodyShape } from '../../lib/bodyPref';
import { OutfitView } from '../../three/OutfitMannequin';
import { Icon } from '../Icon';
import { PersonAvatar } from '../social/PersonAvatar';
import { t } from '../../i18n';

export function garmentsOf(o: SharedOutfit | null) {
  return o ? o.items.map((i) => ({ ...i.wardrobeItem, styling: i.styling })) : [];
}

/** Barra de votos A | B (con los números si se pueden ver). */
export function VoteBar({ battle, big = false }: { battle: Battle; big?: boolean }) {
  const v = battle.votes;
  if (!v) {
    return (
      <div className={`bt-bar is-hidden${big ? ' is-big' : ''}`}>
        <span>
          <Icon name="lock" size={12} /> {t('{totalVotes} {v} · el marcador se ve al votar', { totalVotes: battle.totalVotes, v: battle.totalVotes === 1 ? t('voto') : t('votos') })}
        </span>
      </div>
    );
  }
  return (
    <div className={`bt-bar${big ? ' is-big' : ''}`} style={{ '--a': `${v.shareA}%` } as CSSProperties} aria-label={t('{a} votos contra {b}', { a: v.a, b: v.b })}>
      <span className="bt-bar-a" />
      <span className="bt-bar-b" />
      <b className="bt-bar-na">{v.a}</b>
      <b className="bt-bar-nb">{v.b}</b>
    </div>
  );
}

function Side({ battle, side, active }: { battle: Battle; side: BattleSide; active: boolean }) {
  const { shape } = useBodyShape();
  const outfit = side === 'A' ? battle.outfitA : battle.outfitB;
  const garments = useMemo(() => garmentsOf(outfit), [outfit]);
  const person = sidePerson(battle, side);
  const won = battle.status === 'FINISHED' && battle.winner === side;
  const lost = battle.status === 'FINISHED' && battle.winner !== null && battle.winner !== side;
  return (
    <div className={`bt-side is-${side.toLowerCase()}${won ? ' is-winner' : ''}${lost ? ' is-loser' : ''}`}>
      <div className="bt-side-stage">
        {outfit ? (
          <OutfitView className="tile-view" garments={garments} shape={shape} active={active} distance={4.6} />
        ) : (
          <span className="bt-side-empty" aria-hidden="true">
            ?
          </span>
        )}
        {won && (
          <span className="bt-crown" aria-label={t('Ganador')}>
            <Icon name="crown" size={18} />
          </span>
        )}
      </div>
      <span className="bt-side-who">
        {person ? <PersonAvatar person={person} size={22} /> : <span className="bt-side-dot" />}
        <span>{sideName(battle, side)}</span>
      </span>
    </div>
  );
}

/** Tarjeta de una batalla en las listas: los dos outfits frente a frente. */
export function BattleCard({ battle, index }: { battle: Battle; index: number }) {
  const [active, setActive] = useState(false);
  const st = BATTLE_STATUS[battle.status];
  const left = battle.status === 'ACTIVE' ? timeLeft(battle.endsAt) : battle.status === 'PENDING' ? timeLeft(battle.expiresAt) : null;
  return (
    <Link
      to={`/batallas/${battle.id}`}
      className={`bt-card is-${st.tone}`}
      style={{ '--i': Math.min(index, 12) } as CSSProperties}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <div className="bt-card-head">
        <span className={`bt-status is-${st.tone}`}>
          {st.tone === 'live' && <i className="bt-live-dot" aria-hidden="true" />}
          {st.label}
        </span>
        {battle.canVote ? (
          <span className="bt-cta">
            <Icon name="bolt" size={12} /> {t('Vota')}
          </span>
        ) : (
          left && <span className="bt-left">{left}</span>
        )}
      </div>
      {battle.theme && <p className="bt-theme">«{battle.theme}»</p>}
      <div className="bt-arena is-mini">
        <Side battle={battle} side="A" active={active} />
        <span className="bt-vs" aria-hidden="true">
          {t('VS')}
        </span>
        <Side battle={battle} side="B" active={active} />
      </div>
      {battle.status === 'ACTIVE' || battle.status === 'FINISHED' ? (
        <VoteBar battle={battle} />
      ) : (
        <p className="bt-wait">{battle.isOpen ? t('Reto abierto: cualquiera puede aceptarlo') : t('Esperando respuesta')}</p>
      )}
    </Link>
  );
}
