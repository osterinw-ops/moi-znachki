import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Placeholder, ScreenSpinner, Snackbar, SplitCol, SplitLayout, View } from '@vkontakte/vkui';
import { Icon28CheckCircleOutline, Icon56ErrorOutline } from '@vkontakte/icons';
import { loadCatalog, type Catalog } from './catalog/catalog';
import { warmUpModel } from './recognition/recognize';
import { CatalogContext } from './catalog/useCatalog';
import { loadStore, useStore } from './store/collections';
import { onKvError } from './storage/kv';
import { back, useNav, type Route } from './nav';
import { PopoutContext } from './popout';
import { ToastContext } from './toast';
import { Home } from './panels/Home';
import { CollectionView } from './panels/CollectionView';
import { EditCollection } from './panels/EditCollection';
import { Crop } from './panels/Crop';
import { Result } from './panels/Result';
import { BadgeCard } from './panels/BadgeCard';
import { Pick } from './panels/Pick';
import { NewBadge } from './panels/NewBadge';
import { mergeCustom } from './catalog/merge';

function renderPanel(r: Route) {
  switch (r.panel) {
    case 'home':
      return <Home key="home" id="home" />;
    case 'collection':
      return <CollectionView key="collection" id="collection" colId={r.colId} />;
    case 'editCollection':
      return <EditCollection key={'edit' + (r.colId ?? '')} id="editCollection" colId={r.colId} />;
    case 'crop':
      return <Crop key="crop" id="crop" colId={r.colId} imageUrl={r.imageUrl} />;
    case 'result':
      return <Result key={'result' + r.cropUrl.length} id="result" colId={r.colId} cropUrl={r.cropUrl} candidates={r.candidates} />;
    case 'badge':
      return <BadgeCard key={'badge' + r.badgeId} id="badge" colId={r.colId} badgeId={r.badgeId} />;
    case 'pick':
      return <Pick key="pick" id="pick" colId={r.colId} />;
    case 'newBadge':
      return <NewBadge key="newBadge" id="newBadge" colId={r.colId} cropUrl={r.cropUrl} />;
  }
}

export function App() {
  const [baseCatalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [popout, setPopout] = useState<ReactNode | null>(null);
  const [snack, setSnack] = useState<ReactNode | null>(null);
  const { ready, custom } = useStore();
  // общий каталог + собственные значки пользователя
  const catalog = useMemo(() => (baseCatalog ? mergeCustom(baseCatalog, custom) : null), [baseCatalog, custom]);
  const { stack, ghosts } = useNav();

  const start = useCallback(() => {
    setError(null);
    Promise.all([loadCatalog(), loadStore()])
      .then(([c]) => {
        setCatalog(c);
        // модель грузим заранее, пока пользователь смотрит коллекции
        if (c.nnVectors) setTimeout(() => void warmUpModel(), 1500);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);
  useEffect(start, [start]);

  const toast = useCallback((text: string) => {
    setSnack(
      <Snackbar before={<Icon28CheckCircleOutline fill="var(--vkui--color_icon_positive)" />} onClose={() => setSnack(null)} onClosed={() => setSnack(null)}>
        {text}
      </Snackbar>,
    );
  }, []);

  useEffect(() => onKvError(() => toast('Не удалось сохранить изменения в VK. Проверьте соединение.')), [toast]);

  if (error) {
    return (
      <Placeholder icon={<Icon56ErrorOutline />} title="Не удалось загрузить каталог" action={<Button onClick={start}>Повторить</Button>} stretched>
        {error}
      </Placeholder>
    );
  }
  if (!catalog || !ready) return <ScreenSpinner />;

  const active = stack[stack.length - 1];
  return (
    <CatalogContext.Provider value={catalog}>
      <PopoutContext.Provider value={setPopout}>
        <ToastContext.Provider value={toast}>
          <SplitLayout popout={popout} center>
            <SplitCol maxWidth={560} stretchedOnMobile autoSpaced>
              <View activePanel={panelId(active)} history={stack.map(panelId)} onSwipeBack={back}>
                {[...stack, ...ghosts.filter((g) => !stack.some((r) => r.panel === g.panel))].map(renderPanel)}
              </View>
              {snack}
            </SplitCol>
          </SplitLayout>
        </ToastContext.Provider>
      </PopoutContext.Provider>
    </CatalogContext.Provider>
  );
}

const panelId = (r: Route) => r.panel;
