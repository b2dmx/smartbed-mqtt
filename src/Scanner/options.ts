import { getRootOptions } from '@utils/options';

export interface ScannerDevice {
  name: string;
  pair?: boolean;
  // Stay connected after dumping GATT and log every notification the device sends.
  // Use this to watch status frames while operating the bed by its physical remote,
  // which is how an unknown command set gets decoded.
  listen?: boolean;
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
