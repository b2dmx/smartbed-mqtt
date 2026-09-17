import { connectToMQTT } from '@mqtt/connectToMQTT';
import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { loadStrings } from '@utils/getString';
import { logError, logInfo, logWarn } from '@utils/logger';
import { Type, getTypes } from '@utils/options';
import { IESPConnection } from 'ESPHome/IESPConnection';
import { connectToESPHome } from 'ESPHome/connectToESPHome';
import { ergomotion } from 'ErgoMotion/ergomotion';
import { ergowifi } from 'ErgoWifi/ergowifi';
import { keeson } from 'Keeson/keeson';
import { leggettplatt } from 'LeggettPlatt/leggettplatt';
import { linak } from 'Linak/linak';
import { logicdata } from 'Logicdata/logicdata';
import { motosleep } from 'MotoSleep/motosleep';
import { octo } from 'Octo/octo';
import { okimat } from 'Okimat/okimat';
import { reverie } from 'Reverie/reverie';
import { richmat } from 'Richmat/richmat';
import { scanner } from 'Scanner/scanner';
import { sleeptracker } from 'Sleeptracker/sleeptracker';
import { solace } from 'Solace/solace';

const processExit = (exitCode?: number) => {
  if (exitCode && exitCode > 0) {
    logError(`Exit code: ${exitCode}`);
  }
  process.exit();
};

process.on('exit', () => {
  logWarn('Shutting down Smartbed-MQTT...');
  processExit(0);
});
process.on('SIGINT', () => processExit(0));
process.on('SIGTERM', () => processExit(0));
process.on('uncaughtException', (err) => {
  logError(err);
  processExit(2);
});

// http/udp
const networkTypes: Partial<Record<Type, (mqtt: IMQTTConnection) => Promise<unknown>>> = {
  sleeptracker,
  ergowifi,
  logicdata,
  ergomotion,
};

// bluetooth
const bluetoothTypes: Partial<Record<Type, (mqtt: IMQTTConnection, esphome: IESPConnection) => Promise<unknown>>> = {
  richmat,
  linak,
  solace,
  motosleep,
  reverie,
  leggettplatt,
  okimat,
  keeson,
  octo,
  scanner: (_mqtt, esphome) => scanner(esphome),
};

const start = async () => {
  await loadStrings();

  const types = getTypes();
  if (types.length > 1) logInfo('Running multiple types:', types.join(', '));

  const mqtt = await connectToMQTT();

  for (const type of types) {
    const run = networkTypes[type];
    if (run) await run(mqtt);
  }

  const bluetooth = types.filter((type) => type in bluetoothTypes);
  if (!bluetooth.length) return;

  const esphome = await connectToESPHome();
  for (const type of bluetooth) {
    await bluetoothTypes[type]!(mqtt, esphome);
  }
};
void start();
