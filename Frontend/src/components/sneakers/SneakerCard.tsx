import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Sneaker } from '../../api/types';
import { play } from '../../lib/sfx';
import { CONDITION } from '../../lib/sneakers';
import { useTilt } from '../../lib/useTilt';
import { money, num, WISH_STATUS } from '../../lib/wishlist';
import { Icon } from '../Icon';
import { WishMedia } from '../wishlist/WishMedia';
import { t } from '../../i18n';

/** Puntos del estado de conservación (5 = sin estrenar). Siempre con su nombre al lado. */
export function ConditionDots({ condition }: { condition: Sneaker['sneaker']['condition'] }) {
  const c = CONDITION[condition];
  return (
    <span className="snk-cond" title={c.hint}>
      <span className="snk-cond-dots" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <i key={n} className={n <= c.level ? 'is-on' : ''} />
        ))}
      </span>
      {c.short}
    </span>
  );
}

/**
 * Tarjeta de la galería: foto grande (o el 3D), etiqueta de marca, estado y
 * cifras. Se inclina un poco y un foco sigue al ratón. Las de la wishlist
 * llevan borde discontinuo y la cinta «Wishlist»: todavía no son tuyas.
 */
export function SneakerCard({
  s,
  index,
  fresh,
  onWear,
  onEdit,
}: {
  s: Sneaker;
  index: number;
  fresh: boolean;
  onWear?: () => void;
  onEdit: () => void;
}) {
  const [active, setActive] = useState(false);
  const tilt = useTilt<HTMLElement>(5);
  const wish = !!s.wishlistStatus;
  const price = num(s.currentPrice);
  const [bump, setBump] = useState(0);

  return (
    <article
      ref={tilt.ref}
      className={`snk-card${wish ? ' is-wish' : ''}${fresh ? ' is-fresh' : ''}`}
      style={{ '--i': index, '--sw': s.color } as CSSProperties}
      onPointerMove={tilt.onPointerMove}
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => {
        tilt.onPointerLeave();
        setActive(false);
      }}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <div className="snk-stage">
        <span className="snk-halo" aria-hidden="true" />
        <WishMedia item={s} active={active} className="snk-media" />
        <span className="snk-light" aria-hidden="true" />
        <span className="snk-brand-tag is-card">{s.sneaker.brandLabel}</span>
        {wish ? (
          <span className="snk-ribbon">
            <Icon name="heart" size={11} /> {t('Wishlist · {short}', { short: WISH_STATUS[s.wishlistStatus!].short })}
          </span>
        ) : (
          <ConditionDots condition={s.sneaker.condition} />
        )}
        {fresh && <span className="snk-flash" aria-hidden="true" />}
      </div>

      <div className="snk-info">
        <h3 className="snk-model">
          <Link to={`/sneakers/${s.id}`} className="snk-link" onClick={() => play('click')}>
            {s.sneaker.model}
          </Link>
        </h3>
        <p className="snk-cw">
          <i className="snk-swatch" aria-hidden="true" />
          {s.sneaker.colorway ?? s.colorName}
        </p>
        <dl className="snk-figs">
          <div>
            <dt>{t('Talla')}</dt>
            <dd>{s.size ?? '—'}</dd>
          </div>
          {wish ? (
            <>
              <div>
                <dt>{t('Precio')}</dt>
                <dd>{price === null ? '—' : money(price, s.currency, { compact: true })}</dd>
              </div>
              <div>
                <dt>{t('Objetivo')}</dt>
                <dd>{s.targetPrice ? money(s.targetPrice, s.currency, { compact: true }) : '—'}</dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt>{t('Usos')}</dt>
                <dd key={bump} className={bump ? 'is-bump' : ''}>
                  {s.uses.total}
                </dd>
              </div>
              <div>
                <dt>{t('Outfits')}</dt>
                <dd>{s.outfitCount}</dd>
              </div>
            </>
          )}
        </dl>
      </div>

      <div className="snk-actions">
        {!wish && onWear && (
          <button
            type="button"
            className="snk-wear-btn"
            title={t('Apuntar un uso')}
            onClick={() => {
              setBump((b) => b + 1);
              onWear();
            }}
          >
            <Icon name="plus" size={12} /> {t('1 uso')}
          </button>
        )}
        {wish && (
          <Link to={`/wishlist/${s.id}`} className="snk-wish-link" onClick={() => play('click')}>
            <Icon name="tag" size={12} /> {t('Precios')}
          </Link>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label={t('Editar {name}', { name: s.sneaker.model })}
          title={t('Editar')}
          onClick={() => {
            play('click');
            onEdit();
          }}
        >
          <Icon name="edit" size={14} />
        </button>
      </div>
    </article>
  );
}
