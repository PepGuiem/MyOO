import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { battlesApi, peopleApi } from '../api/endpoints';
import type { BattleSummary, BattleTab, Leaderboard, UserBrief } from '../api/types';
import { BattleCard } from '../components/battles/BattleCard';
import { CreateBattleDialog } from '../components/battles/BattleDialogs';
import { ErrorNote } from '../components/ErrorNote';
import { SprayLoader } from '../components/fx/SprayLoader';
import { useToast } from '../components/fx/Toast';
import { Icon } from '../components/Icon';
import { InfiniteSentinel } from '../components/InfiniteSentinel';
import { PersonAvatar, personName, profilePath } from '../components/social/PersonAvatar';
import { NoMatch } from '../components/street/EmptyStage';
import { SectionHead } from '../components/street/SectionHead';
import { CountUp } from '../components/street/Street';
import { BATTLE_TABS } from '../lib/battles';
import { withTransition } from '../lib/motion';
import { play } from '../lib/sfx';
import { usePagedList } from '../lib/usePagedList';
import { t } from '../i18n';

/**
 * STREETWEAR BATTLES: retos 1 vs 1 entre outfits. Lanzas un reto (a alguien
 * o abierto), el rival responde con su outfit y la comunidad vota 48 h.
 */
export function BattlesPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<BattleTab>('live');
  const [summary, setSummary] = useState<BattleSummary | null>(null);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [creating, setCreating] = useState<{ opponent: UserBrief | null } | null>(null);

  const list = usePagedList((page) => battlesApi.list(tab, page), [tab]);
  const { items, loading, error } = list;

  const loadSide = useCallback(() => {
    battlesApi
      .summary()
      .then(setSummary)
      .catch(() => undefined);
    battlesApi
      .leaderboard()
      .then(setBoard)
      .catch(() => undefined);
  }, []);
  useEffect(loadSide, [loadSide]);

  // «Retar» desde un perfil: /batallas?retar=<id>
  const target = params.get('retar');
  useEffect(() => {
    if (!target) return;
    peopleApi
      .get(target)
      .then((p) => setCreating({ opponent: p }))
      .catch(() => setCreating({ opponent: null }))
      .finally(() => {
        params.delete('retar');
        setParams(params, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const tabInfo = BATTLE_TABS.find((t) => t.id === tab)!;

  return (
    <section className="page bt ux ba">
      <header className="fits-hero bt-hero ux-head">
        <div className="fits-title">
          <span className="wd-kicker">
            <Icon name="bolt" size={12} /> {t('Streetwear battles')}
          </span>
          <h1 className="wd-title ux-title" data-text={t('Batallas')}>
            {t('Batallas')}
          </h1>
          <p className="ux-lede">{t('Reta a alguien con tu outfit, vota los de los demás y sube en el ranking.')}</p>
          <p className="ux-lede sc-path">{t('1 vs 1 · la comunidad decide · 48 h')}</p>
        </div>

        <div className="wd-head-actions">
          <button
            type="button"
            className="btn wd-add bt-launch"
            onClick={() => {
              play('spray');
              setCreating({ opponent: null });
            }}
          >
            <Icon name="bolt" size={16} /> <span>{t('Lanzar reto')}</span>
          </button>
        </div>
      </header>

      <ul className="wd-stats ux-stats" aria-label={t('Resumen')}>
        <li style={{ '--i': 0 } as CSSProperties}>
          <Icon name="trophy" size={16} />
          <strong>{summary ? <CountUp value={summary.record.wins} /> : '–'}</strong>
          <span>{t('Victorias')}</span>
        </li>
        <li style={{ '--i': 1 } as CSSProperties}>
          <Icon name="flame" size={16} />
          <strong>{summary ? <CountUp value={summary.streak} delay={120} /> : '–'}</strong>
          <span>{t('Racha')}</span>
        </li>
        <li style={{ '--i': 2 } as CSSProperties}>
          <Icon name="bolt" size={16} />
          <strong>{summary ? <CountUp value={summary.live} delay={240} /> : '–'}</strong>
          <span>{t('En juego')}</span>
        </li>
      </ul>

      <div className="snk-tabs bt-tabs" role="tablist" aria-label={t('Batallas')}>
        {BATTLE_TABS.map((t) => {
          const n = t.id === 'challenges' ? summary?.challenges : t.id === 'live' ? summary?.live : undefined;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`snk-tab is-${t.id}${t.id === 'challenges' && n ? ' has-alert' : ''}`}
              onClick={() => {
                play('click');
                withTransition(() => setTab(t.id));
              }}
            >
              <Icon name={t.icon} size={15} /> {t.label}
              {n !== undefined && n > 0 && <span className="count">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="bt-layout">
        <div className="bt-main">
          <SectionHead n={1} title={tabInfo.label} />
          {!!error && items.length === 0 && <ErrorNote error={error} />}
          {loading && items.length === 0 && !error && <SprayLoader label={t('Preparando el ring…')} />}
          {!loading && !error && items.length === 0 && (
            <NoMatch icon={tabInfo.icon} title={tabInfo.label} text={tabInfo.empty}>
              {(tab === 'live' || tab === 'open' || tab === 'mine') && (
                <button type="button" className="btn wd-add" onClick={() => setCreating({ opponent: null })}>
                  <Icon name="bolt" size={14} /> <span>{t('Lanzar reto')}</span>
                </button>
              )}
            </NoMatch>
          )}
          <div key={tab} className="bt-grid">
            {items.map((b, i) => (
              <BattleCard key={b.id} battle={b} index={i % 12} />
            ))}
          </div>
          <InfiniteSentinel hasMore={list.hasMore} loading={loading} error={error} onMore={list.loadMore} count={items.length} />
        </div>

        <aside className="bt-board panel" aria-label={t('Ranking de ganadores')}>
          <SectionHead n={2} title={t('Ranking')} />
          {!board ? (
            <SprayLoader label={t('Contando victorias…')} />
          ) : board.top.length === 0 ? (
            <p className="muted">{t('Aún no hay ganadores. La primera batalla que termine abre el ranking.')}</p>
          ) : (
            <>
              <ol className="bt-podium">
                {board.top.slice(0, 3).map((r) => (
                  <li key={r.userId} className={`is-${r.rank}`}>
                    <Link to={profilePath(r.user)}>
                      <PersonAvatar person={r.user} size={r.rank === 1 ? 56 : 44} />
                      <strong>{personName(r.user)}</strong>
                      <span>
                        <CountUp value={r.wins} /> {r.wins === 1 ? t('victoria') : t('victorias')}
                      </span>
                    </Link>
                    <b className="bt-podium-rank">{r.rank}</b>
                  </li>
                ))}
              </ol>
              {board.top.length > 3 && (
                <ol className="bt-ranks" start={4}>
                  {board.top.slice(3, 10).map((r) => (
                    <li key={r.userId}>
                      <span className="bt-rank-n">{r.rank}</span>
                      <PersonAvatar person={r.user} size={24} />
                      <Link to={profilePath(r.user)}>{personName(r.user)}</Link>
                      <span className="bt-rank-w">
                        {r.wins} · {r.winRate}%
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
          {board && (
            <p className="bt-me">
              {board.me.played === 0
                ? t('Todavía no has jugado ninguna batalla.')
                : t('Tú: {wins} {v}, {losses} {v2}{v3}{v4}', { wins: board.me.wins, v: board.me.wins === 1 ? t('victoria') : t('victorias'), losses: board.me.losses, v2: board.me.losses === 1 ? t('derrota') : t('derrotas'), v3: board.me.ties ? `, ${board.me.ties} ${board.me.ties === 1 ? t('empate') : t('empates')}` : '', v4: board.me.rank ? t(' · puesto {rank}', { rank: board.me.rank }) : '' })}
            </p>
          )}
        </aside>
      </div>

      {creating && (
        <CreateBattleDialog
          initialOpponent={creating.opponent}
          onClose={() => setCreating(null)}
          onCreated={(b) => {
            setCreating(null);
            play('success');
            toast.show(b.isOpen ? t('Reto abierto lanzado') : t('Reto enviado a {personName}', { personName: personName(b.opponent) }), { tone: 'ok', icon: 'bolt' });
            navigate(`/batallas/${b.id}`);
          }}
        />
      )}
    </section>
  );
}
