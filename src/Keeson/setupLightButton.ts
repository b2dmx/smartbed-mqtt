import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { buildCommandButton } from 'Common/buildCommandButton';
import { Commands } from 'Common/Commands';
import { IController } from 'Common/IController';

// The under-bed lights are on the physical remote and the command is the same
// one ErgoMotion, ErgoWifi and Leggett & Platt already use.
export const setupLightButton = (mqtt: IMQTTConnection, controller: IController<number>) => {
  buildCommandButton('Keeson', mqtt, controller, 'SafetyLightsToggle', Commands.ToggleSafetyLights);
};
