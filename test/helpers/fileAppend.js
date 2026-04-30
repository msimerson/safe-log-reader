import { appendFile } from 'node:fs/promises';

const filePath = process.env.FILE_PATH;
const newLine  = process.env.LOG_LINE || 'you forget to set LOG_LINE\n';

await appendFile(filePath, newLine);
process.send(`fileAppend -> fs.appendFile: ${filePath}`);
