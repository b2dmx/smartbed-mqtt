import { getRootOptions } from '@utils/options';

export interface ScannerDevice {
  name: string;
  pair?: boolean;
  // Stay connected after dumping GATT and log every notification the device sends.
  // Use this to watch status frames while operating the bed by its physical remote,
  // which is how an unknown command set gets decoded.
  listen?: boolean;
  // Hex frames to write to the Nordic UART command characteristic (6e400002) after
  // subscribing, e.g. '04 02 00 00 00 00'. Each is sent in turn with writeDelayMs
  // between them and any notification the device sends back is logged. This is how an
  // undocumented command set gets probed. Writes never target the DFU characteristic.
  writes?: string[];
  writeDelayMs?: number;
  // Wait this long after subscribing before the first write, so a run can be timed to
  // a wall-clock second regardless of how long the add-on restart and connect take.
  writeStartDelayMs?: number;
  // Absolute ISO-8601 instant for the first write, e.g. '2026-09-16T20:20:00Z'. Takes
  // precedence over writeStartDelayMs and makes add-on restart latency irrelevant.
  writeStartAt?: string;
}

interface OptionsJson {
  scannerDevices: ScannerDevice[];
}

const options: OptionsJson = getRootOptions();

export const getDevices = () => {
  const devices = options.scannerDevices;
  if (Array.isArray(devices)) {
    return devices;
  }
  return [];
};
