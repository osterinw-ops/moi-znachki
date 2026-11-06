/**
 * Настройки приложения. Можно переопределить переменными окружения при сборке
 * (файл .env или .env.production), см. README.
 */

/** Откуда грузить каталог: относительный путь (VK-хостинг) или CDN, например
 *  https://cdn.jsdelivr.net/gh/<user>/<repo>@main/public/catalog/ */
export const CATALOG_URL: string = import.meta.env.VITE_CATALOG_URL || './catalog/';

/** Куда вести пользователя с предложением нового значка (сообщения сообщества и т. п.). */
export const SUGGEST_URL: string = import.meta.env.VITE_SUGGEST_URL || '';

/** Альбом сообщества, из которого значки пользователей попадают в общий каталог. */
export const SHARE_ALBUM_URL: string = import.meta.env.VITE_SHARE_ALBUM_URL || 'https://vk.com/album-243034935_312442377';

/** Модель нейросети (ONNX). Движок onnxruntime-web берётся из ./ort/ */
export const MODEL_URL: string = import.meta.env.VITE_MODEL_URL || './model/mnv2.onnx';

/** Ниже этого сходства показываем предупреждение «не уверены». */
export const LOW_CONFIDENCE = 0.8;
