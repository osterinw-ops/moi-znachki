import { useState } from 'react';
import { Alert, Button, Checkbox, Div, FormItem, Group, Header, Input, Panel, PanelHeader, PanelHeaderBack, Textarea } from '@vkontakte/vkui';
import { Icon24DeleteOutline } from '@vkontakte/icons';
import { useCatalog } from '../catalog/useCatalog';
import { createCollection, deleteCollection, editCollection, useStore } from '../store/collections';
import { back, backTo, replace } from '../nav';
import { usePopout } from '../popout';

export function EditCollection({ id, colId }: { id: string; colId?: string }) {
  const catalog = useCatalog();
  const { collections } = useStore();
  const existing = collections.find((c) => c.id === colId);
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [series, setSeries] = useState<string[]>(existing?.series ?? []);
  const [touched, setTouched] = useState(false);
  const setPopout = usePopout();

  const countBySeries = (s: string) => catalog.badges.filter((b) => b.series === s).length;
  const toggle = (s: string) => setSeries((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const save = () => {
    setTouched(true);
    if (!name.trim()) return;
    if (existing) {
      editCollection(existing.id, { name: name.trim(), description: description.trim(), series });
      back();
    } else {
      const c = createCollection(name, description, series);
      replace({ panel: 'collection', colId: c.id });
    }
  };

  const askDelete = () =>
    setPopout(
      <Alert
        title="Удалить коллекцию?"
        description={`«${existing?.name}» и отметки о значках в ней будут удалены. Заметки о значках сохранятся.`}
        actions={[
          { title: 'Отмена', mode: 'cancel' },
          {
            title: 'Удалить',
            mode: 'destructive',
            action: () => {
              deleteCollection(existing!.id);
              backTo((r) => r.panel === 'home');
            },
          },
        ]}
        onClosed={() => setPopout(null)}
      />,
    );

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={back} />}>{existing ? 'Коллекция' : 'Новая коллекция'}</PanelHeader>
      <Group>
        <FormItem top="Название" htmlFor="col-name" status={touched && !name.trim() ? 'error' : 'default'} bottom={touched && !name.trim() ? 'Введите название' : undefined}>
          <Input id="col-name" value={name} maxLength={60} placeholder="Например, «СССР» или «Спорт»" onChange={(e) => setName(e.target.value)} />
        </FormItem>
        <FormItem top="Описание (необязательно)" htmlFor="col-desc">
          <Textarea id="col-desc" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
        </FormItem>
      </Group>
      {catalog.series.length > 0 && (
        <Group header={<Header subtitle="Значки отмеченных серий появятся в коллекции контурами — так видно, что ещё собрать">Серии каталога</Header>}>
          {catalog.series.map((s) => (
            <Checkbox key={s} checked={series.includes(s)} onChange={() => toggle(s)} description={`${countBySeries(s)} знач.`}>
              {s}
            </Checkbox>
          ))}
        </Group>
      )}
      <Div>
        <Button size="l" stretched onClick={save}>
          {existing ? 'Сохранить' : 'Создать'}
        </Button>
        {existing && (
          <Button size="l" stretched mode="tertiary" appearance="negative" before={<Icon24DeleteOutline />} onClick={askDelete} className="gap-top">
            Удалить коллекцию
          </Button>
        )}
      </Div>
    </Panel>
  );
}
