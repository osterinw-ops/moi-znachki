import { useRef, useState } from 'react';
import type { Badge } from '../catalog/catalog';
import { Group, Panel, PanelHeader, PanelHeaderBack, Placeholder, Search, Text } from '@vkontakte/vkui';
import { useCatalog } from '../catalog/useCatalog';
import { addOwned, addWanted, useStore } from '../store/collections';
import { back } from '../nav';
import { BadgeIcon } from '../components/BadgeIcon';
import { useToast } from '../toast';

/** Ручной выбор значка из каталога (если фото не распозналось). */
export function Pick({ id, colId }: { id: string; colId: string }) {
  const catalog = useCatalog();
  const { collections } = useStore();
  const col = collections.find((c) => c.id === colId);
  const [q, setQ] = useState('');
  const toast = useToast();
  const query = q.trim().toLowerCase();
  const found = catalog.badges.filter(
    (b) => !query || b.name.toLowerCase().includes(query) || (b.series ?? '').toLowerCase().includes(query) || String(b.year ?? '').includes(query),
  );

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={back} />}>Каталог</PanelHeader>
      <Group>
        <Search value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название, серия или год" />
        <Text className="muted pad-x">Нажмите — «есть в наличии». Долгое нажатие — добавить в цель контуром. Нужного значка нет? Сфотографируйте его и выберите «Добавить свой».</Text>
        {found.length === 0 ? (
          <Placeholder title="Ничего не найдено" />
        ) : (
          <div className="badge-grid">
            {found.map((b) => (
              <PickTile
                key={b.id}
                badge={b}
                owned={!!col?.owned.includes(b.id)}
                onTap={() => {
                  const was = !!col?.owned.includes(b.id);
                  addOwned(colId, b);
                  toast(was ? `«${b.name}» уже есть` : `«${b.name}» добавлен`);
                }}
                onLongPress={() => {
                  addWanted(colId, b.id);
                  toast(`«${b.name}» добавлен в цель`);
                }}
              />
            ))}
          </div>
        )}
      </Group>
    </Panel>
  );
}

function PickTile({ badge, owned, onTap, onLongPress }: { badge: Badge; owned: boolean; onTap: () => void; onLongPress: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const long = useRef(false);
  const cancel = () => clearTimeout(timer.current);
  return (
    <button
      className="badge-tile"
      onPointerDown={() => {
        long.current = false;
        timer.current = setTimeout(() => {
          long.current = true;
          onLongPress();
        }, 550);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => !long.current && onTap()}
    >
      <BadgeIcon badge={badge} owned={owned} size="100%" />
      <span className="badge-tile__name">{badge.name}</span>
      <span className="badge-tile__score muted">{badge.series}</span>
    </button>
  );
}
