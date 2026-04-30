import { rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const tmpDir  = resolve('test', 'tmp');
const oldPath = process.env.OLD_PATH || resolve(tmpDir, 'old');
const newPath = process.env.NEW_PATH || resolve(tmpDir, 'new');

await rename(oldPath, newPath);
process.send(`fileRename -> fs.rename: \n\t ${oldPath} -> \n\t${newPath}`);
