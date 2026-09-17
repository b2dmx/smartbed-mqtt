import { readFileSync } from 'fs';

export type Type =
  | 'sleeptracker'
  | 'ergomotion'
  | 'ergowifi'
  | 'richmat'
  | 'linak'
  | 'solace'
  | 'motosleep'
  | 'reverie'
  | 'leggettplatt'
  | 'logicdata'
  | 'okimat'
  | 'keeson'
  | 'octo'
  | 'scanner';

interface OptionsJson {
  type: Type;
  additionalTypes?: Type[];
}

const fileContents = readFileSync('../data/options.json');
const options: OptionsJson = JSON.parse(fileContents.toString());
export const getRootOptions = (): any => options;

export const getType = () => options.type;

/**
 * The configured type, followed by any additional types. This allows a single bed to be
 * driven by more than one integration at once - for example a Keeson (local BLE) connection
 * for the motors, alongside a Sleeptracker (cloud) connection for features that have no
 * local equivalent.
 */
export const getTypes = (): Type[] => {
  const additionalTypes = options.additionalTypes ?? [];
  return [options.type, ...additionalTypes].filter(
    (type, index, types) => !!type && types.indexOf(type) === index
  );
};
