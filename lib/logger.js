// stub logger — replace with winston, log4js, or npmlog for production use

export function debug(msg) {
  if (!process.env.DEBUG) return;
  console.log(msg);
}

export function info(msg) {
  if (process.env.NODE_ENV === 'test') return;
  console.info(msg);
}

export function error(msg) {
  if (process.env.NODE_ENV === 'test') return;
  console.error(msg);
}
