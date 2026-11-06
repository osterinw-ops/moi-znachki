import { useEffect, useState } from 'react';
import { Alert, Button, Div, FormItem, Group, Header, InfoRow, Panel, PanelHeader, PanelHeaderBack, SimpleCell, Switch, Text, Textarea, Title } from '@vkontakte/vkui';
import { Icon24DeleteOutline } from '@vkontakte/icons';
import { useCatalog } from '../catalog/useCatalog';
import { deleteCustomBadge, loadNote, removeFromCollection, saveNote, setOwned, useStore } from '../store/collections';
import { back } from '../nav';
import { BadgeIcon } from '../components/BadgeIcon';
import { usePopout } from '../popout';
import bridge from '@vkontakte/vk-bridge';
import { SHARE_ALBUM_URL } from '../config';
import { useToast } from '../toast';

/** Карточка значка: название, год, серия, цвета, заметки пользователя. */
export function BadgeCard({ id, colId, badgeId }: { id: string; colId: string; badgeId: string }) {
  const catalog = useCatalog();
  const { collections } = useStore();
  const col = collections.find((c) => c.id === colId);
  const badge = catalog.byId.get(badgeId);
  const owned = !!col?.owned.includes(badgeId);
  const inSeries = !!(badge?.series && col?.series.includes(badge.series));
  const [note, setNote] = useState('');
  const [noteLoaded, setNoteLoaded] = useState(false);
  const setPopout = usePopout();
  const toast = useToast();

  /** Подпись для альбома сообщества: «Название / Серия / Год». */
  const shareToCatalog = async () => {
    if (!badge) return;
    const caption = [badge.name, badge.series, badge.year].filter(Boolean).join(' / ');
    try {
      await bridge.send('VKWebAppCopyText', { text: caption });
    } catch {
      try {
        await navigator.clipboard.writeText(caption);
      } catch {
        /* не скопировалось — подпись видна в подсказке */
      }
    }
    toast(`Подпись скопирована: ${caption}`);
    window.open(SHARE_ALBUM_URL, '_blank');
  };

  useEffect(() => {
    loadNote(badgeId).then((n) => {
      setNote(n);
      setNoteLoaded(true);
    });
  }, [badgeId]);

  if (!badge || !col) return <Panel id={id}><PanelHeader before={<PanelHeaderBack onClick={back} />}>Значок</PanelHeader></Panel>;

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={back} />}>Значок</PanelHeader>
      <Group>
        <Div className="card-hero">
          <BadgeIcon badge={badge} owned={owned} size={200} />
          <Title level="1" className="center gap-top">
            {badge.name}
          </Title>
        </Div>
        <SimpleCell
          Component="label"
          after={<Switch checked={owned} onChange={(e) => setOwned(colId, badgeId, e.target.checked)} />}
          subtitle={owned ? 'Показывается в цвете' : 'Показывается контуром'}
        >
          Есть в коллекции
        </SimpleCell>
      </Group>

      <Group header={<Header>Информация</Header>}>
        {badge.year && (
          <SimpleCell multiline>
            <InfoRow header="Год">{badge.year}</InfoRow>
          </SimpleCell>
        )}
        {badge.series && (
          <SimpleCell multiline>
            <InfoRow header="Серия">{badge.series}</InfoRow>
          </SimpleCell>
        )}
        {badge.description && (
          <SimpleCell multiline>
            <InfoRow header="Описание">{badge.description}</InfoRow>
          </SimpleCell>
        )}
        {badge.palette.length > 0 && (
          <SimpleCell multiline>
            <InfoRow header="Цвета">
              <span className="palette">
                {badge.palette.map((p) => (
                  <span key={p.hex} className="palette__chip" title={p.hex} style={{ background: p.hex, flexGrow: p.share }} />
                ))}
              </span>
            </InfoRow>
          </SimpleCell>
        )}
      </Group>

      <Group header={<Header>Мои заметки</Header>}>
        <FormItem>
          <Textarea
            value={note}
            disabled={!noteLoaded}
            maxLength={1500}
            placeholder="Где и когда получен, состояние, обмен…"
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => saveNote(badgeId, note)}
          />
        </FormItem>
      </Group>

      {badge?.custom && (
        <Div>
          <Text className="muted center">Свой значок: его нет в общем каталоге, он хранится только у вас.</Text>
          <Button size="l" stretched mode="secondary" className="gap-top" onClick={shareToCatalog}>
            Добавить в общий каталог
          </Button>
          <Text className="muted center gap-top">
            Откроется альбом сообщества «Мои Значки». Загрузите туда фото значка крупно, на однотонном фоне, и вставьте скопированную подпись «Название / Серия / Год». В течение нескольких часов значок появится в каталоге у всех.
          </Text>
          <Button
            size="l"
            stretched
            mode="tertiary"
            appearance="negative"
            before={<Icon24DeleteOutline />}
            className="gap-top"
            onClick={() =>
              setPopout(
                <Alert
                  title="Удалить свой значок?"
                  description={`«${badge.name}» исчезнет из всех коллекций вместе с заметкой.`}
                  actions={[
                    { title: 'Отмена', mode: 'cancel' },
                    {
                      title: 'Удалить',
                      mode: 'destructive',
                      action: () => {
                        back();
                        deleteCustomBadge(badge.id);
                      },
                    },
                  ]}
                  onClosed={() => setPopout(null)}
                />,
              )
            }
          >
            Удалить свой значок
          </Button>
        </Div>
      )}
      {!inSeries && !badge?.custom && (
        <Div>
          <Button
            size="l"
            stretched
            mode="tertiary"
            appearance="negative"
            before={<Icon24DeleteOutline />}
            onClick={() => {
              removeFromCollection(colId, badgeId);
              back();
            }}
          >
            Убрать из коллекции
          </Button>
        </Div>
      )}
    </Panel>
  );
}
