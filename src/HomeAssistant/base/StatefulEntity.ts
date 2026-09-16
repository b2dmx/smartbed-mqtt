import { IDeviceData } from '@ha/IDeviceData';
import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { ComponentType } from './ComponentTypeWithState';
import { Entity, EntityConfig } from './Entity';
import { IStateful } from './IStateful';

export class StatefulEntity<T> extends Entity implements IStateful<T> {
  stateTopic: string;

  private state?: T;

  constructor(
    mqtt: IMQTTConnection,
    deviceData: IDeviceData,
    entityConfig: EntityConfig,
    componentType: ComponentType
  ) {
    super(mqtt, deviceData, entityConfig, componentType);
    this.stateTopic = `${this.baseTopic}/state`;
  }

  discoveryState() {
    return {
      ...super.discoveryState(),
      state_topic: this.stateTopic,
    };
  }

  protected mapState(state: T | undefined): any {
    return state === undefined ? null : state;
  }

  setState(state: T | null) {
    if (state === null) {
      return this.setOffline();
    }
    if (this.state !== state) {
      this.state = state;
      this.sendState();
    }
    // Always re-assert availability, even when the value is unchanged: a transient
    // upstream failure marks entities offline, and if the value happens to be the same
    // once it recovers the entity would otherwise stay unavailable until a restart.
    this.setOnline();
    return this;
  }

  getState() {
    return this.state;
  }

  // setState is a no-op when the value is unchanged, so an entity whose value never
  // changes would never re-send. Re-send the current state alongside availability.
  republish() {
    super.republish();
    if (this.state !== undefined) this.sendState();
    return this;
  }

  private sendState() {
    setTimeout(() => {
      const message = this.mapState(this.state);
      this.mqtt.publish(this.stateTopic, message);
    }, 250);
  }
}
