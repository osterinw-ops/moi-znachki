import { useEffect, useState } from 'react';
import { Button, Div, FormItem, Group, Input, Panel, PanelHeader, PanelHeaderBack, Text, Textarea } from '@vkontakte/vkui';
import { useCatalog } from '../catalog/useCatalog';
import { addCustomBadge, addOwned, useStore } from '../store/collections';
import { describe } from '../recognition/recognize';
import { packVector } from '../recognition/pack';
import { packNN } from '../recognition/nn';
import { back, backTo } from '../nav';
import { useToast } from '../toast';

const THUMB = 112; // размер фото своего значка в VK Storage (≈5 КБ)

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
}

const toB64 = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

/**
 * Свой значок: если его нет в общем каталоге, пользователь добавляет его сам.
 * Значок хранится у пользователя (VK Storage) и дальше распознаётся по фото,
 * как и значки каталога.
 */
export function NewBadge({ id, colId, cropUrl }: { id: string; colId: string; cropUrl: string }) {
  const catalog = useCatalog();
  const { collections } = useStore();
  const col = collections.find((c) => c.id === colId);
  const [name, setName] = useState('');
  const [series, setSeries] = useState('');
  const [year, setYear] = useState('');
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // серия по умолчанию — первая отслеживаемая в этой коллекции
  useEffect(() => {
    if (col?.series[0]) setSeries(col.series[0]);
  }, [col?.id]);

  const yearNum = Number(year);
  const yearOk = !year || (Number.isInteger(yearNum) && yearNum >= 1700 && yearNum <= new Date().getFullYear());

  const save = async () => {
    setTouched(true);
    if (!name.trim() || !yearOk || !col) return;
    setBusy(true);
    try {
      const im = await loadImage(cropUrl);
      // векторы для распознавания — по тому же кадру 256×256, что и при поиске
      const c256 = document.createElement('canvas');
      c256.width = c256.height = 256;
      c256.getContext('2d')!.drawImage(im, 0, 0, 256, 256);
      const { hc, nn } = await describe(c256, !!catalog.nnVectors);
      // уменьшенное фото для показа в коллекции
      const t = document.createElement('canvas');
      t.width = t.height = THUMB;
      const ctx = t.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(im, 0, 0, THUMB, THUMB);
      const img = t.toDataURL('image/jpeg', 0.8);

      const badgeId = addCustomBadge({
        name: name.trim(),
        series: series.trim() || undefined,
        year: year ? yearNum : undefined,
        description: description.trim() || undefined,
        img,
        hc: packVector(hc),
        nn: nn ? toB64(packNN([nn])) : undefined,
      });
      addOwned(colId, { id: badgeId, name: name.trim(), series: series.trim() || undefined, img, palette: [], contour: '', custom: true });
      toast(`«${name.trim()}» добавлен в «${col.name}»`);
      backTo((r) => r.panel === 'collection' && r.colId === colId);
    } catch (e) {
      console.error(e);
      toast('Не удалось сохранить значок. Попробуйте ещё раз.');
      setBusy(false);
    }
  };

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={back} />}>Свой значок</PanelHeader>
      <Group>
        <img src={cropUrl} alt="" className="new-badge-photo" />
        <Div>
          <Text className="muted center">
            Значка нет в общем каталоге — опишите его, и он появится в ваших коллекциях. В следующий раз приложение узнает его по фото.
          </Text>
        </Div>
        <FormItem top="Название" htmlFor="nb-name" status={touched && !name.trim() ? 'error' : 'default'} bottom={touched && !name.trim() ? 'Введите название' : undefined}>
          <Input id="nb-name" value={name} maxLength={60} placeholder="Например, «Тула — герб города»" onChange={(e) => setName(e.target.value)} />
        </FormItem>
        <FormItem top="Серия (необязательно)" htmlFor="nb-series">
          <Input id="nb-series" value={series} maxLength={40} list="nb-series-list" placeholder="Гербы городов, Спорт…" onChange={(e) => setSeries(e.target.value)} />
          <datalist id="nb-series-list">
            {catalog.series.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </FormItem>
        <FormItem top="Год (необязательно)" htmlFor="nb-year" status={touched && !yearOk ? 'error' : 'default'} bottom={touched && !yearOk ? 'Год от 1700 до текущего' : undefined}>
          <Input id="nb-year" value={year} inputMode="numeric" maxLength={4} placeholder="1975" onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} />
        </FormItem>
        <FormItem top="Описание (необязательно)" htmlFor="nb-desc">
          <Textarea id="nb-desc" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
        </FormItem>
        <Div>
          <Button size="l" stretched loading={busy} onClick={save}>
            Добавить в «{col?.name}»
          </Button>
        </Div>
      </Group>
    </Panel>
  );
}
