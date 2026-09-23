import { Connection } from '@2colors/esphome-native-api';
import { logError, logInfo } from '@utils/logger';

export const connect = (connection: Connection) => {
  return new Promise<Connection>((resolve, reject) => {
    const errorHandler = (error: any) => {
      logError('[ESPHome] Failed Connecting:', error);
      reject(error);
    };
    connection.once('authorized', async () => {
      logInfo('[ESPHome] Connected:', connection.host);
      connection.off('error', errorHandler);
      // Keep a permanent error listener for the life of the connection. Without one,
      // a later socket drop (ECONNRESET, proxy reboot, Wi-Fi blip) emits an 'error'
      // with no listener attached, which Node rethrows into uncaughtException - and the
      // whole add-on exits. Repeated fast exits trip Supervisor's crash-loop guard,
      // which then leaves the add-on stopped (dead for a day, as observed). Log it and
      // let auto-reconnect recover instead of crashing.
      connection.on('error', (error: any) =>
        logError('[ESPHome] Connection error (will auto-reconnect):', connection.host, error?.message ?? error)
      );
      // TODO: Fix next two lines after new version of esphome-native-api is released
      const deviceInfo = await connection.deviceInfoService();
      const { bluetoothProxyFeatureFlags } = deviceInfo as any;
      if (!bluetoothProxyFeatureFlags) {
        logError('[ESPHome] No Bluetooth proxy features detected:', connection.host);
        return reject();
      }
      resolve(connection);
    });
    const doConnect = (handler: (error: any) => void) => {
      try {
        connection.once('error', handler);
        connection.connect();
        connection.off('error', handler);
        connection.once('error', errorHandler);
      } catch (err) {
        errorHandler(err);
      }
    };
    const retryHandler = (error: any) => {
      logError('[ESPHome] Failed Connecting (will retry):', error);
      doConnect(errorHandler);
    };
    doConnect(retryHandler);
  });
};
