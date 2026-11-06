import { useState } from 'react';
import { Button, ButtonGroup, Div, Group, Panel, PanelHeader, PanelHeaderBack, PanelHeaderButton, Placeholder, Progress, SegmentedControl, Text } from '@vkontakte/vkui';
import { Icon24CameraOutline, Icon24PictureOutline, Icon28EditOutline, Icon28SearchOutline, Icon56CameraOutline } from '@vkontakte/icons';
import { useCatalog } from '../catalog/useCatalog';
import { collectionBadges, collectionStats, useStore } from '../store/collections';
import { back, push } from '../nav';
import { BadgeIcon } from '../components/BadgeIcon';
import { pickFromGallery, pickPhoto } from '../photoPicker';

type Filter = 'all' | 'owned' | 'missing';

export function CollectionView({ id, colId }: { id: string; colId: string }) {
  const catalog = useCatalog();
  const { collections } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const c = collections.find((x) => x.id === colId);
  if (!c) {
    return (
      <Panel id={id}>
        <PanelHeader before={<PanelHeaderBack onClick={back} />}>Коллекция</PanelHeader>
        <Placeholder title="Коллекция удалена" />
      </Panel>
    );
  }
  const badges = collectionBadges(c, catalog);
  const stats = collectionStats(c, catalog);
  const shown = badges.filter((b) => (filter === 'all' ? true : filter === 'owned' ? c.owned.includes(b.id) : !c.owned.includes(b.id)));

  return (
    <Panel id={id}>
      <PanelHeader
        before={<PanelHeaderBack onClick={back} />}
        after={
          <PanelHeaderButton aria-label="Изменить коллекцию" onClick={() => push({ panel: 'editCollection', colId })}>
            <Icon28EditOutline />
          </PanelHeaderButton>
        }
      >
        {c.name}
      </PanelHeader>

      <Group>
        <Div>
          {c.description && <Text className="muted gap-bottom">{c.description}</Text>}
          <Text weight="2">
            Собрано {stats.owned} из {stats.total} · {stats.percent}%
          </Text>
          <Progress value={stats.percent} className="progress-gap" />
        </Div>
        <Div>
          <ButtonGroup stretched mode="horizontal" gap="m">
            <Button size="l" stretched before={<Icon24CameraOutline />} onClick={() => pickPhoto(colId)}>
              Сфотографировать
            </Button>
            <Button size="l" mode="secondary" aria-label="Выбрать фото из галереи" before={<Icon24PictureOutline />} onClick={() => pickFromGallery(colId)} />
            <Button size="l" mode="secondary" aria-label="Найти в каталоге" before={<Icon28SearchOutline width={24} height={24} />} onClick={() => push({ panel: 'pick', colId })} />
          </ButtonGroup>
        </Div>
      </Group>

      <Group>
        {badges.length === 0 ? (
          <Placeholder icon={<Icon56CameraOutline />} title="Коллекция пуста">
            Сфотографируйте значок — приложение узнает его и добавит сюда. Или отметьте серии каталога в настройках коллекции.
          </Placeholder>
        ) : (
          <>
            <Div>
              <SegmentedControl
                value={filter}
                onChange={(v) => setFilter(v as Filter)}
                options={[
                  { label: `Все ${badges.length}`, value: 'all' },
                  { label: `Есть ${stats.owned}`, value: 'owned' },
                  { label: `Нет ${badges.length - stats.owned}`, value: 'missing' },
                ]}
              />
            </Div>
            <div className="badge-grid">
              {shown.map((b) => {
                const owned = c.owned.includes(b.id);
                return (
                  <button key={b.id} className="badge-tile" onClick={() => push({ panel: 'badge', colId, badgeId: b.id })}>
                    <BadgeIcon badge={b} owned={owned} size="100%" />
                    <span className={owned ? 'badge-tile__name' : 'badge-tile__name muted'}>{b.name}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Group>
    </Panel>
  );
}
