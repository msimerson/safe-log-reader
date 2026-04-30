// https://nodejs.org/api/stream.html#stream_object_mode

import { StringDecoder } from 'node:string_decoder';
import { Transform } from 'node:stream';

export class LineSplitter extends Transform {

  constructor(options = {}) {
    super(options.transform ?? { objectMode: true });

    this._encoding  = options.encoding  || 'utf8';
    this._separator = options.separator || '\n';
    this._buffer    = '';
    this._decoder   = new StringDecoder(this._encoding);
    this.bytes      = options.bytes || 0;
  }

  _transform(chunk, encoding, done) {
    this.bytes += chunk.length;

    this._buffer += encoding !== this._encoding
      ? this._decoder.write(chunk)  // buffer from archive
      : chunk;                       // already decoded by createReadStream

    const lines = this._buffer.split(this._separator);
    this._buffer = lines.pop();
    for (const line of lines) this.push(line);
    done();
  }

  _flush(done) {
    const rem = this._buffer.trim();
    if (rem) this.push(rem);
    this._buffer = '';
    done();
  }
}

export default LineSplitter;
