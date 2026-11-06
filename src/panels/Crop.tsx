import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Div, FormItem, Group, Panel, PanelHeader, PanelHeaderBack, Placeholder, Slider, Spinner, Text } from '@vkontakte/vkui';
import { Icon56ErrorOutline } from '@vkontakte/icons';
import { useCatalog } from '../catalog/useCatalog';
import { recognize, trackModel } from '../recognition/recognize';
import { back, push } from '../nav';

const OUT = 256; // размер кадра для распознавания

/**
 * Кадрирование: пользователь двигает и масштабирует фото так, чтобы значок
 * попал в круг. Это и есть «детекция и выравнивание» — надёжнее любой
 * автоматики на слабых телефонах, а поворот распознаванию не важен.
 */
export function Crop({ id, colId, imageUrl }: { id: string; colId: string; imageUrl: string }) {
  const catalog = useCatalog();
  const boxRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState(false);
  const [V, setV] = useState(320); // сторона видимой области, px
  const [zoom, setZoom] = useState(1); // 1 = короткая сторона фото на весь кадр
  const [pos, setPos] = useState({ x: 0, y: 0 }); // центр кадра в координатах фото
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  useEffect(() => {
    if (catalog.nnVectors) trackModel(setModel);
  }, [catalog]);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    const im = new Image();
    im.onload = () => {
      setImg(im);
      setPos({ x: im.naturalWidth / 2, y: im.naturalHeight / 2 });
    };
    im.onerror = () => setError(true);
    im.src = imageUrl;
  }, [imageUrl]);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setV(Math.min(el.clientWidth, 440)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [img]);

  if (error) {
    return (
      <Panel id={id}>
        <PanelHeader before={<PanelHeaderBack onClick={back} />}>Фото</PanelHeader>
        <Placeholder icon={<Icon56ErrorOutline />} title="Не удалось открыть фото" action={<Button onClick={back}>Назад</Button>} />
      </Panel>
    );
  }

  const base = img ? V / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const s = base * zoom; // экранных px на px фото
  const clampPos = (p: { x: number; y: number }, sc = s) => {
    if (!img) return p;
    const half = V / 2 / sc;
    return {
      x: Math.min(Math.max(p.x, half * 0.5), img.naturalWidth - half * 0.5),
      y: Math.min(Math.max(p.y, half * 0.5), img.naturalHeight - half * 0.5),
    };
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const z = Math.min(6, Math.max(0.5, (pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist));
      setZoom(z);
      return;
    }
    if (pointers.current.size === 1) {
      setPos((p) => clampPos({ x: p.x - (cur.x - prev.x) / s, y: p.y - (cur.y - prev.y) / s }));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const onWheel = (e: React.WheelEvent) => setZoom((z) => Math.min(6, Math.max(0.5, z * (e.deltaY < 0 ? 1.1 : 0.9))));

  const run = () => {
    if (!img) return;
    setBusy(true);
    // даём интерфейсу отрисовать спиннер
    setTimeout(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = OUT;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, OUT, OUT);
      const side = V / s;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, pos.x - side / 2, pos.y - side / 2, side, side, 0, 0, OUT, OUT);
      const candidates = (await recognize(canvas, catalog, 6)).map((c) => ({ id: c.badge.id, score: c.score }));
      const cropUrl = canvas.toDataURL('image/jpeg', 0.85);
      setBusy(false);
      push({ panel: 'result', colId, cropUrl, candidates });
    }, 30);
  };

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={back} />}>Наведите круг на значок</PanelHeader>
      <Group>
        <div ref={boxRef} className="crop-host">
          {img ? (
            <div
              className="crop-box"
              style={{ width: V, height: V }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onWheel={onWheel}
            >
              <img
                src={imageUrl}
                alt=""
                draggable={false}
                style={{
                  width: img.naturalWidth * s,
                  height: img.naturalHeight * s,
                  transform: `translate(${V / 2 - pos.x * s}px, ${V / 2 - pos.y * s}px)`,
                }}
              />
              <div className="crop-ring" />
            </div>
          ) : (
            <Spinner size="l" />
          )}
        </div>
        <Div>
          <Text className="muted center">Перетащите фото и масштабируйте (двумя пальцами или ползунком), чтобы значок целиком заполнил круг.</Text>
        </Div>
        <FormItem top="Масштаб">
          <Slider min={0.5} max={6} step={0.05} value={zoom} onChange={(z) => setZoom(z)} />
        </FormItem>
        <Div>
          <Button size="l" stretched loading={busy} disabled={!img} onClick={run}>
            Распознать
          </Button>
          {model === 'loading' && <Text className="muted center gap-top">Загружаю нейросеть (один раз, ≈25 МБ)…</Text>}
          {model === 'failed' && <Text className="muted center gap-top">Нейросеть не загрузилась — распознаю по цветам, точность ниже.</Text>}
        </Div>
      </Group>
    </Panel>
  );
}
