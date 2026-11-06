import type { Badge } from '../catalog/catalog';
import { useCatalog } from '../catalog/useCatalog';

/**
 * Иконка значка: в цвете, если есть в наличии, иначе — монохромный SVG-контур.
 * У своих значков пользователя контура нет: «нет в наличии» — блёклое фото.
 * Свои значки — это фото в круге, поэтому и показываются кругом.
 */
export function BadgeIcon({ badge, owned, size = 96 }: { badge: Badge; owned: boolean; size?: number | string }) {
  const catalog = useCatalog();
  const style = { width: size, height: size };
  if (owned || !badge.contour) {
    const cls = ['badge-icon', owned ? 'badge-icon--owned' : 'badge-icon--ghost', badge.custom ? 'badge-icon--photo' : ''].join(' ');
    return <img className={cls} src={badge.img} alt={owned ? badge.name : `${badge.name} — нет в коллекции`} style={style} loading="lazy" draggable={false} />;
  }
  return (
    <svg
      className="badge-icon badge-icon--missing"
      style={style}
      viewBox={catalog.contourViewBox}
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeLinecap="round"
      role="img"
      aria-label={`${badge.name} — нет в коллекции`}
      dangerouslySetInnerHTML={{ __html: badge.contour }}
    />
  );
}
