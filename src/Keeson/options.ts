import { getRootOptions } from '@utils/options';

export interface KeesonDevice {
  friendlyName: string;
  name: string;
}

interface OptionsJson {
  keesonDevices: KeesonDevice[];
  keesonSyncSides?: boolean;
  keesonSyncName?: string;
}

const options: OptionsJson = getRootOptions();

export const getDevices = () => {
  const devices = options.keesonDevices;
  if (Array.isArray(devices)) {
    return devices;
  }
  return [];
};

// A split base has one controller per side. With a single mattress across both,
// moving one side alone risks damaging it, so offer a device that drives both at once.
export const getSyncSides = () => options.keesonSyncSides === true;

export const getSyncName = () => options.keesonSyncName || 'Bed';
