import { useEffect, useState } from 'react';
import bridge from '@vkontakte/vk-bridge';
import { Avatar, Button, Cell, Div, Group, Header, Panel, PanelHeader, Placeholder, Progress, SimpleCell, Text } from '@vkontakte/vkui';
import { Icon28AddOutline, Icon56StickerOutline } from '@vkontakte/icons';
import { useCatalog } from '../catalog/useCatalog';
import { collectionStats, profileStats, useStore } from '../store/collections';
import { inVK } from '../storage/kv';
import { push } from '../nav';
import { BadgeIcon } from '../components/BadgeIcon';
import { plural } from '../util';

interface User {
  name: string;
  photo?: string;
}

export function Home({ id }: { id: string }) {
  const catalog = useCatalog();
  const { collections } = useStore();
  const [user, setUser] = useState<User>({ name: 'Коллекционер' });

  useEffect(() => {
    if (!inVK) return;
    bridge
      .send('VKWebAppGetUserInfo')
      .then((u) => setUser({ name: `${u.first_name} ${u.last_name}`, photo: u.photo_100 }))
      .catch(() => {});
  }, []);

  const stats = profileStats(collections, catalog);

  return (
    <Panel id={id}>
      <PanelHeader>Мои Значки</PanelHeader>
      <Group>
        <SimpleCell
          before={<Avatar size={56} src={user.photo} initials={user.name[0]} />}
          subtitle={`${stats.badges} ${plural(stats.badges, 'значок', 'значка', 'значков')} · ${stats.collections} ${plural(stats.collections, 'коллекция', 'коллекции', 'коллекций')}`}
        >
          {user.name}
        </SimpleCell>
        {stats.largest && stats.largest.total > 0 && (
          <Div>
            <Text className="muted">
              Самая большая коллекция «{stats.largest.name}» заполнена на {stats.largest.percent}%
            </Text>
            <Progress value={stats.largest.percent} className="progress-gap" />
          </Div>
        )}
      </Group>

      <Group header={<Header>Мои коллекции</Header>}>
        {collections.length === 0 ? (
          <Placeholder
            icon={<Icon56StickerOutline />}
            title="Пока нет коллекций"
            action={
              <Button size="m" onClick={() => push({ panel: 'editCollection' })}>
                Создать коллекцию
              </Button>
            }
          >
            Создайте коллекцию, например «Космос» или «IT-конференции», и сфотографируйте первый значок.
          </Placeholder>
        ) : (
          <>
            {collections.map((c) => {
              const s = collectionStats(c, catalog);
              const preview = c.owned.slice(-3).map((bid) => catalog.byId.get(bid)).filter((b) => !!b);
              return (
                <Cell
                  key={c.id}
                  chevron="auto"
                  onClick={() => push({ panel: 'collection', colId: c.id })}
                  subtitle={
                    <>
                      {s.owned} из {s.total} · {s.percent}%
                      <Progress value={s.percent} className="progress-gap" />
                    </>
                  }
                  after={
                    <span className="cell-preview">
                      {preview.map((b) => (
                        <BadgeIcon key={b.id} badge={b} owned size={32} />
                      ))}
                    </span>
                  }
                  multiline
                >
                  {c.name}
                </Cell>
              );
            })}
            <Div>
              <Button size="l" mode="secondary" stretched before={<Icon28AddOutline />} onClick={() => push({ panel: 'editCollection' })}>
                Новая коллекция
              </Button>
            </Div>
          </>
        )}
      </Group>
    </Panel>
  );
}
