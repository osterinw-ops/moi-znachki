import { createContext, useContext } from 'react';
import type { Catalog } from './catalog';

export const CatalogContext = createContext<Catalog | null>(null);

export function useCatalog(): Catalog {
  const c = useContext(CatalogContext);
  if (!c) throw new Error('Каталог ещё не загружен');
  return c;
}
