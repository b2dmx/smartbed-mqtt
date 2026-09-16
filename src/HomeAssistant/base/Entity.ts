import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { Dictionary } from '@utils/Dictionary';
import { safeId } from '@utils/safeId';
import { seconds } from '@utils/seconds';
import { IDeviceData } from '../IDeviceData';
import { ComponentType as EntityWithStateComponentType } from './ComponentTypeWithState';
import { IAvailable } from './IAvailable';

const ONLINE = 'online';
const OFFLINE = 'offline';
type ComponentType = 'button' | 'cover' | EntityWithStateComponentType;

export type EntityConfig = {
  description: string;
  category?: string;
  icon?: string;
};

export class Entity implements IAvailable {
  // Every entity registers itself so a refresh cycle can re-assert what HA may have
  // missed: messages are published without the retain flag, so an HA restart or broker
  // reconnect silently drops state and availability, and an entity whose value never
  // changes would otherwise never publish again.
  private static readonly all: Entity[] = [];

  static republishAll() {
    for (const entity of Entity.all) entity.republish();
  }

  private static republishTimer?: NodeJS.Timeout;

  // Entities publish availability (and state) once, shortly after their discovery
  // message and without the retain flag. When many entities are created at once HA
  // may still be processing discovery when those arrive, stranding them as
  // unavailable - and BLE device types have no refresh loop to correct it. Re-assert
  // on a timer so a missed message is always recovered.
  private static ensureRepublishTimer() {
    if (Entity.republishTimer) return;
    Entity.republishTimer = setInterval(() => Entity.republishAll(), seconds(30));
  }

  protected baseTopic: string;
  private availabilityTopic: string;
  private entityTag: string;
  private availability?: string;
  private uniqueId: string;

  constructor(
    protected mqtt: IMQTTConnection,
    protected deviceData: IDeviceData,
    protected entityConfig: EntityConfig,
    private componentType: ComponentType
  ) {
    this.entityTag = safeId(entityConfig.description);
    this.uniqueId = `${safeId(deviceData.device.name)}_${this.entityTag}`;
    this.baseTopic = `${deviceData.deviceTopic}/${this.entityTag}`;
    this.availabilityTopic = `${this.baseTopic}/status`;
    this.mqtt.subscribe('homeassistant/status');
    this.mqtt.on('homeassistant/status', (message) => {
      if (message === ONLINE) setTimeout(() => this.publishDiscovery(), seconds(15));
    });
    setTimeout(() => this.publishDiscovery(), 50);
    Entity.all.push(this);
    Entity.ensureRepublishTimer();
  }

  publishDiscovery() {
    const discoveryTopic = `homeassistant/${this.componentType}/${this.deviceData.deviceTopic}_${this.entityTag}/config`;
    const discoveryMessage = {
      name: this.entityConfig.description,
      unique_id: this.uniqueId,
      device: this.deviceData.device,
      ...this.discoveryState(),
    };

    this.mqtt.publish(discoveryTopic, discoveryMessage);
  }

  protected discoveryState(): Dictionary<any> {
    return {
      availability_topic: this.availabilityTopic,
      payload_available: ONLINE,
      payload_not_available: OFFLINE,
      ...(this.entityConfig.category ? { entity_category: this.entityConfig.category } : {}),
      ...(this.entityConfig.icon ? { icon: this.entityConfig.icon } : {}),
    };
  }

  setOffline() {
    this.availability = OFFLINE;
    this.sendAvailability(OFFLINE);
    return this;
  }

  setOnline() {
    this.availability = ONLINE;
    this.sendAvailability(ONLINE);
    return this;
  }

  // Re-send availability. Subclasses that hold state also re-send it.
  republish() {
    if (this.availability !== undefined) this.sendAvailability(this.availability);
    return this;
  }

  private sendAvailability(availability: string) {
    setTimeout(() => this.mqtt.publish(this.availabilityTopic, availability), 500);
  }
}

export const republishEntities = () => Entity.republishAll();
