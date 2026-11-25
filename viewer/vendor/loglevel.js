/* ESM shim for the loglevel package.
   loglevel ships no ESM build (its main entry is UMD), and dxf-viewer
   imports it as `import log from "loglevel"`. This shim implements the
   subset dxf-viewer actually uses (log.debug/warn/error + setLevel),
   with loglevel's default level ("warn": debug/info are silent).
   It is our own code, not a copy of loglevel. */

const LEVELS = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, silent: 5 };
let currentLevel = LEVELS.warn;

function makeLogger() {
  const logger = {};
  for (const [name, level] of Object.entries(LEVELS)) {
    if (name === "silent") continue;
    logger[name] = (...args) => {
      if (level >= currentLevel && typeof console[name] === "function") {
        console[name](...args);
      }
    };
  }
  logger.setLevel = (level) => {
    currentLevel = LEVELS[level] !== undefined ? LEVELS[level] : LEVELS.warn;
  };
  logger.getLevel = () => currentLevel;
  logger.getLogger = () => logger;
  logger.enableAll = () => { currentLevel = LEVELS.trace; };
  logger.disableAll = () => { currentLevel = LEVELS.silent; };
  return logger;
}

const log = makeLogger();
export default log;
