import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class JsonStore {
  constructor(path) {
    if (!path) throw new Error('store path is required');
    this.path = path;
    this.queue = Promise.resolve();
  }

  async load(fallback = {}) {
    try {
      const raw = await readFile(this.path, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error?.code === 'ENOENT') return structuredClone(fallback);
      throw error;
    }
  }

  async save(value) {
    this.queue = this.queue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temp = `${this.path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await rename(temp, this.path);
    });
    return this.queue;
  }
}
