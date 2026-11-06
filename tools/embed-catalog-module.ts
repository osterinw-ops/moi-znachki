/** Для демо-сборки: вшивает каталог и картинки (data URI) в src/catalog/embedded.generated.ts */
import fs from 'node:fs';

const catalog = JSON.parse(fs.readFileSync('public/catalog/catalog.json', 'utf8'));
const embeddings = JSON.parse(fs.readFileSync('public/catalog/embeddings.json', 'utf8'));
for (const b of catalog.badges) {
  const bytes = fs.readFileSync(`public/catalog/${b.img}`);
  b.img = `data:image/webp;base64,${bytes.toString('base64')}`;
}
const nnBin = embeddings.nn ? fs.readFileSync(`public/catalog/${embeddings.nn.file}`).toString('base64') : '';
fs.writeFileSync(
  'src/catalog/embedded.generated.ts',
  `// сгенерировано tools/embed-catalog-module.ts — не редактировать\nexport const catalog = ${JSON.stringify(catalog)};\nexport const embeddings = ${JSON.stringify(embeddings)};\nexport const nnBin = ${JSON.stringify(nnBin)};\n`,
);
console.log('embedded.generated.ts готов');
