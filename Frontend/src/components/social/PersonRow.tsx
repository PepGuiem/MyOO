import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { UserBrief } from '../../api/types';
import { Icon } from '../Icon';
import { PersonAvatar, personName, profilePath } from './PersonAvatar';

/** Una persona en una lista: foto, nombre, @usuario y una acción a la derecha. */
export function PersonRow({ person, action, sub }: { person: UserBrief; action?: ReactNode; sub?: ReactNode }) {
  return (
    <li className="person-row">
      <Link to={profilePath(person)} className="person-link">
        <PersonAvatar person={person} size={42} />
        <span className="person-text">
          <strong>
            {personName(person)}
            {person.isPrivate && (
              <span className="lock" title="Cuenta privada">
                <Icon name="lock" size={12} />
              </span>
            )}
          </strong>
          <small className="muted">{sub ?? (person.username ? `@${person.username}` : '')}</small>
        </span>
      </Link>
      {action && <span className="person-action">{action}</span>}
    </li>
  );
}
