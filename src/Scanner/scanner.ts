import { logError, logInfo, logWarn } from '@utils/logger';
import { getDevices } from './options';
import { IESPConnection } from 'ESPHome/IESPConnection';
import { buildDictionary } from '@utils/buildDictionary';
import { Deferred } from '@utils/deferred';
import { IBLEDevice } from 'ESPHome/types/IBLEDevice';

const characteristicPropertyValues = {
  BROADCAST: 0x01,
  READ: 0x02,
  WRITE_NO_RESPONSE: 0x04,
  WRITE: 0x08,
  NOTIFY: 0x10,
  INDICATE: 0x20,
  AUTHENTICATED: 0x40,
  EXTENDED: 0x80,
};
const extractPropertyNames = (properties: number) => {
  const propertiesList: string[] = [];

  for (const [name, value] of Object.entries(characteristicPropertyValues)) {
    if ((properties & value) === value) {
      properties -= value;
      propertiesList.push(name);
      if (properties === 0) break;
    }
  }
  return propertiesList.sort();
};
export const scanner = async (esphome: IESPConnection) => {
  const devices = getDevices().filter((d) => !!d.name);
  const devicesMap = buildDictionary(devices, (device) => ({ key: device.name.toLowerCase(), value: device }));
  const deviceNames = Object.keys(devicesMap);
  if (deviceNames.length !== devices.length) return logError('[Scanner] Duplicate name detected in configuration');

  const complete = new Deferred<void>();
  const logDevice = async ({ name, mac, advertisement }: IBLEDevice) => {
    logInfo(`[Scanner] Found device: ${name} (${mac}):\n${JSON.stringify(advertisement)}`);
  };

  const handleMatchingDevice = async (bleDevice: IBLEDevice) => {
    const { name, mac } = bleDevice;
    const lowerName = name.toLowerCase();
    let index = deviceNames.indexOf(mac);
    if (index === -1) index = deviceNames.indexOf(lowerName);
    if (index === -1) index = deviceNames.findIndex((deviceName) => lowerName.startsWith(deviceName));
    if (index === -1) return;

    logDevice(bleDevice);
    const mapName = deviceNames.splice(index, 1)[0];
    const { connect, disconnect, pair, getDeviceInfo, getServices } = bleDevice;
    logInfo(`[Scanner] Connecting`);
    await connect();
    const device = devicesMap[mapName];
    if (device.pair) {
      logInfo('[Scanner] Pairing');
      await pair();
    }

    logInfo('[Scanner] Querying GATT services');
    const services = await getServices();

    logInfo('[Scanner] Extracting device info');
    const deviceInfo = await getDeviceInfo();

    const servicesList = await Promise.all(
      services.map(async (service) => {
        const characteristicList = await Promise.all(
          service.characteristicsList.map(async (characteristic) => {
            const { properties, handle } = characteristic;
            const propertyList = [properties, ...extractPropertyNames(properties)];
            let data = undefined;
            if ((properties & 2) === 2) {
              try {
                const value = await bleDevice.readCharacteristic(handle);
                const buffer = Buffer.from(value);
                data = {
                  base64: buffer.toString('base64'),
                  ascii: buffer.toString(),
                  raw: Array.from(value),
                };
              } catch {
                data = 'Read Error';
                console.error(`Couldn't read characteristic 0x${handle.toString(16)}`);
              }
            }
            return { ...characteristic, properties: propertyList, ...(data ? { data } : {}) };
          })
        );
        return {
          ...service,
          characteristicsList: characteristicList.sort(({ uuid: uuidA }, { uuid: uuidB }) =>
            uuidA.localeCompare(uuidB)
          ),
        };
      })
    );
    const { address, addressType, rssi, manufacturerDataList, serviceUuidsList, serviceDataList } =
      bleDevice.advertisement;
    const deviceData = {
      name,
      mac,
      address,
      addressType,
      rssi,
      manufacturerDataList,
      serviceDataList,
      serviceUuidsList,
      ...(deviceInfo ? { deviceInfo } : {}),
      servicesList: servicesList.sort(({ uuid: uuidA }, { uuid: uuidB }) => uuidA.localeCompare(uuidB)),
    };

    logInfo(`[Scanner] Output:\n${JSON.stringify(deviceData, null, 2)}`);

    if (device.listen) {
      const notifyCharacteristics = servicesList.flatMap(({ uuid: serviceUuid, characteristicsList }) =>
        characteristicsList
          .filter(({ properties }) => properties.includes('NOTIFY') || properties.includes('INDICATE'))
          .map(({ uuid, handle }) => ({ serviceUuid, uuid, handle }))
      );

      if (!notifyCharacteristics.length) {
        logWarn('[Scanner] listen requested but device has no notify/indicate characteristics:', name);
      } else {
        const started = Date.now();
        for (const { serviceUuid, uuid, handle } of notifyCharacteristics) {
          await bleDevice.subscribeToCharacteristic(handle, (data) => {
            const hex = Array.from(data)
              .map((b) => b.toString(16).padStart(2, '0'))
              .join(' ');
            const elapsed = ((Date.now() - started) / 1000).toFixed(1);
            logInfo(`[Scanner] Notify +${elapsed}s handle 0x${handle.toString(16)} ${uuid}: ${hex}`);
          });
          logInfo(`[Scanner] Listening on ${serviceUuid} / ${uuid} (handle 0x${handle.toString(16)})`);
        }
        logInfo('[Scanner] Staying connected and logging notifications - operate the device now, then stop the add-on.');
      }

      if (device.writes?.length) {
        // Only ever the Nordic UART command characteristic. Never the DFU characteristic
        // (fe59 / 8ec90003) - writing to that can put the device into bootloader mode.
        const writeCharacteristic = servicesList
          .flatMap(({ characteristicsList }) => characteristicsList)
          .find(({ uuid }) => uuid === '6e400002-b5a3-f393-e0a9-e50e24dcca9e');

        if (!writeCharacteristic) {
          logWarn('[Scanner] writes requested but device has no Nordic UART command characteristic:', name);
        } else {
          const delay = device.writeDelayMs ?? 4000;
          if (device.writeStartDelayMs) {
            logInfo(`[Scanner] Holding ${device.writeStartDelayMs}ms before first write`);
            await new Promise((resolve) => setTimeout(resolve, device.writeStartDelayMs));
          }
          logInfo(`[Scanner] Writing begins at ${new Date().toISOString()}`);
          for (const frame of device.writes) {
            const bytes = frame
              .trim()
              .split(/[\s,]+/)
              .filter((part) => part.length)
              .map((part) => parseInt(part, 16));
            if (bytes.some((value) => Number.isNaN(value) || value < 0 || value > 0xff)) {
              logWarn(`[Scanner] Skipping unparseable write frame: ${frame}`);
              continue;
            }
            logInfo(`[Scanner] Write -> ${bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
            try {
              await bleDevice.writeCharacteristic(writeCharacteristic.handle, new Uint8Array(bytes), true);
            } catch (err) {
              logError('[Scanner] Write failed', err);
            }
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
          logInfo('[Scanner] Finished writing probe frames; still listening.');
        }
      }
      return;
    }

    await disconnect();

    if (deviceNames.length) return;
    complete.resolve();
  };

  const worker = devices.length ? handleMatchingDevice : logDevice;
  if (!devices.length) logInfo('[Scanner] No devices configured, logging all named devices');
  await esphome.discoverBLEDevices(worker, complete, (name) => name?.replace(/\0/g, ''));
  esphome.disconnect();
  logInfo('[Scanner] Done');
  return;
};
