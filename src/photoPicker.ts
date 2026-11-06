import { push } from './nav';

/**
 * Открывает камеру телефона (в клиенте VK — системный выбор «Камера / Галерея»).
 * Вызывать строго из обработчика нажатия: браузер требует жест пользователя.
 */
export function pickPhoto(colId: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.setAttribute('capture', 'environment');
  input.style.display = 'none';
  input.onchange = () => {
    const file = input.files?.[0];
    input.remove();
    if (file) push({ panel: 'crop', colId, imageUrl: URL.createObjectURL(file) });
  };
  document.body.appendChild(input);
  input.click();
}

/** Выбор из галереи без принудительной камеры. */
export function pickFromGallery(colId: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  input.onchange = () => {
    const file = input.files?.[0];
    input.remove();
    if (file) push({ panel: 'crop', colId, imageUrl: URL.createObjectURL(file) });
  };
  document.body.appendChild(input);
  input.click();
}
