import { stat, mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as logger from './logger.js';

export class Bookmark {

  constructor(dir = './.bookmark') {
    this.dirPath = resolve(dir);
    this.createDir().catch(err => logger.debug(err));
  }

  async createDir() {
    try {
      await stat(this.dirPath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      await mkdir(this.dirPath, { recursive: true });
      logger.info(`created bookmark dir: ${this.dirPath}`);
    }
  }

  async save(args) {
    const fileStat = await stat(args.file);
    const contents = JSON.stringify({
      file:  args.file,
      size:  args.bytes,
      lines: args.lines,
      inode: fileStat.ino,
    });
    const bmPath = resolve(this.dirPath, fileStat.ino.toString());
    try {
      await this.#atomicWrite(bmPath, contents);
    } catch {
      // on rare occasions the write can fail silently; retry once after a short delay
      const delay = (Math.floor(Math.random() * 3) + 1) * 1000;
      await new Promise(r => setTimeout(r, delay));
      await this.#atomicWrite(bmPath, contents);
    }
    logger.info(`bookmark.save: line: ${args.lines}`);
  }

  async #atomicWrite(bmPath, contents) {
    const tmpPath = `${bmPath}.tmp`;
    await writeFile(tmpPath, contents);
    const tmpStat = await stat(tmpPath);
    if (!tmpStat.size || process.env.MOCK_STAT_ERROR === 'true') {
      logger.error(tmpStat);
      logger.error('stat should have had...');
      logger.error(contents);
      throw new Error(`${tmpPath} is empty!`);
    }
    await rename(tmpPath, bmPath);
  }

  async read(logFilePath) {
    const fileStat = await stat(logFilePath);
    const bmPath   = resolve(this.dirPath, fileStat.ino.toString());
    const data     = await readFile(bmPath, 'utf8');
    if (!data) throw new Error('empty bookmark file!');

    const mark = JSON.parse(data);
    if (mark.size > fileStat.size) {
      logger.info(`bookmark.read: old size ${mark.size} > ${fileStat.size}`);
      return null;
    }
    logger.info(`bookmark.read: line ${mark.lines} size ${mark.size}`);
    return mark;
  }
}

export default Bookmark;
