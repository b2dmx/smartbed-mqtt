import { getRootOptions } from '@utils/options';

export type Type = 'tempur' | 'beautyrest' | 'serta';

export type Feature =
  | 'climate'
  | 'presets'
  | 'massage'
  | 'motors'
  | 'positionSensors'
  | 'massageSensors'
  | 'snoreRelief'
  | 'safetyLight'
  | 'environment';

export interface Credentials {
  email: string;
  password: string;
  type?: Type;
}

interface OptionsJson {
  sleeptrackerRefreshFrequency: number;
  sleeptrackerCredentials: Credentials[];
  sleeptrackerFeatures?: Feature[];
}

const options: OptionsJson = getRootOptions();

export const getUsers = () => {
  const credentials = options.sleeptrackerCredentials;
  if (Array.isArray(credentials)) {
    return credentials;
  }
  return [credentials];
};
export const getRefreshFrequency = () => options.sleeptrackerRefreshFrequency;

/**
 * Which Sleeptracker features to expose. An empty (or missing) list means all of them, which
 * is the behaviour when Sleeptracker is the only configured type. Narrowing the list is useful
 * when another type already provides some of the entities locally - for example running Keeson
 * for the motors and leaving Sleeptracker to provide only `climate`.
 */
export const isFeatureEnabled = (feature: Feature) => {
  const features = options.sleeptrackerFeatures;
  return !Array.isArray(features) || !features.length || features.includes(feature);
};
