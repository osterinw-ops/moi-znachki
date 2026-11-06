import { useState } from 'react';
import { Banner, Button, Div, Group, Header, Link, Panel, PanelHeader, PanelHeaderBack, Text, Title } from '@vkontakte/vkui';
import { useCatalog } from '../catalog/useCatalog';
import { addOwned, useStore } from '../store/collections';
import { back, backTo, replace } from '../nav';
import { BadgeIcon } from '../components/BadgeIcon';
import { LOW_CONFIDENCE } from '../config';
import { useToast } from '../toast';

/** Экран подтверждения: найденный значок, его векторный контур и альтернативы. */
export function Result({ id, colId, cropUrl, candidates }: { id: string; colId: string; cropUrl: string; candidates: { id: string; score: number }[] }) {
  const catalog = useCatalog();
  const { collections } = useStore();
  const col = collections.find((c) => c.id === colId);
  const [selected, setSelected] = useState(candidates[0]?.id);
  const [more, setMore] = useState(false);
  const toast = useToast();
  const best = candidates[0];
  const chosen = selected ? catalog.byId.get(selected) : undefined;
  const list = candidates.slice(0, more ? 6 : 3);
  const pct = (s: number) => Math.max(0, Math.round(s * 100));

  const confirm = () => {
    if (!chosen || !col) return;
    const already = col.owned.includes(chosen.id);
    addOwned(colId, chosen);
    toast(already ? `«${chosen.name}» уже есть в коллекции` : `«${chosen.name}» добавлен в «${col.name}»`);
    backTo((r) => r.panel === 'collection' && r.colId === colId);
  };

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={back} />}>Это ваш значок?</PanelHeader>
      <Group>
        {chosen && (
          <Div className="result-hero">
            <div className="result-pair">
              <figure>
                <img src={cropUrl} alt="Ваше фото" className="result-photo" />
                <figcaption className="muted">Ваше фото</figcaption>
              </figure>
              <figure>
                <BadgeIcon badge={chosen} owned={false} size={132} />
                <figcaption className="muted">{chosen.custom ? 'Ваш значок' : 'Контур из каталога'}</figcaption>
              </figure>
            </div>
            <Title level="2" className="center gap-top">
              {chosen.name}
            </Title>
            <Text className="muted center">
              {[chosen.series, chosen.year].filter(Boolean).join(' · ')}
            </Text>
          </Div>
        )}
        {best && (best.score < LOW_CONFIDENCE || (candidates[1] && best.score - candidates[1].score < 0.03)) && (
          <Banner
            title="Не уверены в результате"
            subtitle="Проверьте варианты ниже. Если значка нет — найдите его в каталоге вручную или добавьте как свой."
          />
        )}
        <Div>
          <Button size="l" stretched disabled={!chosen} onClick={confirm}>
            Добавить в «{col?.name}»
          </Button>
        </Div>
      </Group>

      <Group header={<Header>Похожие значки</Header>}>
        <div className="badge-grid">
          {list.map((c) => {
            const b = catalog.byId.get(c.id);
            if (!b) return null;
            return (
              <button key={c.id} className={'badge-tile' + (c.id === selected ? ' badge-tile--selected' : '')} onClick={() => setSelected(c.id)}>
                <BadgeIcon badge={b} owned size="100%" />
                <span className="badge-tile__name">{b.name}</span>
                <span className="badge-tile__score">{pct(c.score)}%</span>
              </button>
            );
          })}
        </div>
        <Div className="result-links">
          {!more && candidates.length > 3 && <Link onClick={() => setMore(true)}>Показать ещё</Link>}
          <Link onClick={() => replace({ panel: 'pick', colId })}>Найти в каталоге вручную</Link>
          <Link onClick={() => replace({ panel: 'newBadge', colId, cropUrl })}>Моего значка здесь нет — добавить свой</Link>
        </Div>
      </Group>
    </Panel>
  );
}
