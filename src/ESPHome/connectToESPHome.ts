import { Connection } from '@2colors/esphome-native-api';
import { logInfo } from '@utils/logger';
import { ESPConnection } from './ESPConnection';
import { IESPConnection } from './IESPConnection';
import { connect } from './connect';
import { BLEProxy, getProxies } from './options';

export const connectToESPHome = async (): Promise<IESPConnection> => {
  logInfo('[ESPHome] Connecting...');

  const proxies = getProxies();
  const connections =
    proxies.length == 0
      ? []
      : await Promise.all(
          proxies.map(async (config: BLEProxy) => {
            // reconnect:true lets the library re-establish the SAME connection
            // object's socket after a drop, so existing controller references stay
            // valid and per-command BLE connects keep working.
            const connection = new Connection({ ...config, reconnect: true } as any);
            return await connect(connection);
          })
        );
  return new ESPConnection(connections);
};
