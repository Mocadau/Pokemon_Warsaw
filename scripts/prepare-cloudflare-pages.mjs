import { spawnSync } from 'node:child_process';
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

await assertNoDatalessFiles('public');
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('dist-app', 'dist/pokemon', { recursive: true });
copyDirectoryContents('public', 'dist/pokemon');
await removeNamedFiles('dist/pokemon', '.DS_Store');

await writeFile(
  'dist/_redirects',
  [
    '/pokemon /pokemon/ 301',
    '/pokemon/* /pokemon/index.html 200',
    '',
  ].join('\n')
);

function copyDirectoryContents(source, destination) {
  const result = spawnSync('cp', ['-R', `${source}/.`, destination], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Failed to copy ${source} to ${destination}`);
  }
}

async function assertNoDatalessFiles(root) {
  const datalessFiles = [];
  await walk(root, async (filePath) => {
    const fileStat = await stat(filePath);
    if (fileStat.isFile() && fileStat.size > 0 && fileStat.blocks === 0) {
      datalessFiles.push(filePath);
    }
  });

  if (!datalessFiles.length) return;

  throw new Error(
    [
      'Some assets are cloud placeholders and are not downloaded locally:',
      ...datalessFiles.map((filePath) => `- ${filePath}`),
      'Download these files locally, then run npm run build again.',
    ].join('\n')
  );
}

async function walk(directory, visitFile) {
  const entries = await readdir(directory, { withFileTypes: true });

  await Promise.all(entries.map(async (entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, visitFile);
      return;
    }
    await visitFile(entryPath);
  }));
}

async function removeNamedFiles(root, fileName) {
  await walk(root, async (filePath) => {
    if (filePath.endsWith(`/${fileName}`)) {
      await rm(filePath, { force: true });
    }
  });
}
