import { createRoot } from 'react-dom/client';
import bridge from '@vkontakte/vk-bridge';
import { AdaptivityProvider, AppRoot, ConfigProvider } from '@vkontakte/vkui';
import '@vkontakte/vkui/dist/vkui.css';
import './styles.css';
import { App } from './App';

bridge.send('VKWebAppInit').catch(() => {
  /* вне ВКонтакте — работаем как обычная веб-страница */
});

createRoot(document.getElementById('root')!).render(
  <ConfigProvider>
    <AdaptivityProvider>
      <AppRoot>
        <App />
      </AppRoot>
    </AdaptivityProvider>
  </ConfigProvider>,
);
