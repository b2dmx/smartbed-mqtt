import { IDeviceData } from '@ha/IDeviceData';
import { Dictionary } from '@utils/Dictionary';
import { IController } from 'Common/IController';
import { buildMQTTDeviceData } from 'Common/buildMQTTDeviceData';

// A split base is two independent controllers. When both halves sit under a single
// mattress, moving one side alone can damage it, so this fans every command out to
// every controller at once and exposes them as one more device in Home Assistant.
// The per-side devices are still published - a genuine split mattress wants those.
export const buildSyncController = (
  friendlyName: string,
  controllers: IController<number>[]
): IController<number> => {
  const cache: Dictionary<Object> = {};
  const deviceData: IDeviceData = buildMQTTDeviceData(
    { friendlyName, name: 'Synchronized Sides', address: 'sync' },
    'Keeson'
  );

  const all = async (action: (controller: IController<number>) => Promise<void>) => {
    await Promise.all(controllers.map(action));
  };

  return {
    cache,
    deviceData,
    writeCommand: (command, count, waitTime) => all((c) => c.writeCommand(command, count, waitTime)),
    writeCommands: (commands, count, waitTime) => all((c) => c.writeCommands(commands, count, waitTime)),
    cancelCommands: () => all((c) => c.cancelCommands()),
  };
};
