import { IBLEDevice } from 'ESPHome/types/IBLEDevice';

// Keeson controllers expose their command channel over Nordic UART, but not every
// variant advertises the service UUID in its advertisement - KSSF05C... controllers
// (as used in Tempur ActiveBreeze bases) advertise no service UUIDs at all. Match on
// the Keeson name prefix as well and let controllerBuilder confirm by looking for the
// characteristic after connecting; it already returns undefined when it is absent.
export const isSupported = ({ name, advertisement: { serviceUuidsList } }: IBLEDevice) =>
  name.startsWith('KS') || serviceUuidsList.includes('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
