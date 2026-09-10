import * as NATIVE_RTC from '@iris/native-rtc';
import {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  IBufferSourceAudioTrack,
  ILocalTrack,
  ILocalVideoTrack,
  IRemoteTrack,
  IRemoteVideoTrack,
  ITrack,
} from 'agora-rtc-sdk-ng';

import { IrisAudioSourceType } from '../base/BaseType';

import { BufferSourceAudioTrackPackage } from '../engine/IrisClientManager';

import { IrisRtcEngine } from '../engine/IrisRtcEngine';

import { getUidFromRemoteUser } from '../util';

export type TrackType =
  | 'ILocalTrack'
  | 'ILocalVideoTrack'
  | 'IRemoteTrack'
  | 'IBufferSourceAudioTrack'
  | 'IRemoteVideoTrack';
export interface IrisTrackEventHandlerParam {
  client?: IAgoraRTCClient;
  remoteUser?: IAgoraRTCRemoteUser;
  track: ITrack;
  trackType: TrackType;
  videoSourceType?:
    | NATIVE_RTC.VIDEO_SOURCE_TYPE
    | NATIVE_RTC.EXTERNAL_VIDEO_SOURCE_TYPE;
}

//一个track可能被多个Client发布出去，所以一个track可以同事存在多个TrackEventHandler
export class IrisTrackEventHandler {
  private _client?: IAgoraRTCClient;
  private _remoteUser?: IAgoraRTCRemoteUser;
  private _track: ITrack | IBufferSourceAudioTrack;
  private _trackType: TrackType = 'ILocalTrack';
  private _videoSourceType?:
    | NATIVE_RTC.VIDEO_SOURCE_TYPE
    | NATIVE_RTC.EXTERNAL_VIDEO_SOURCE_TYPE;

  private _engine: IrisRtcEngine;

  private __onEventTrackEnded: Function;
  private __onEventFirstFrameDecoded = Function;
  private __onEventSourceStateChange = Function;

  constructor(params: IrisTrackEventHandlerParam, engine: IrisRtcEngine) {
    this._client = params.client;
    this._remoteUser = params.remoteUser;
    this._track = params.track;
    this._trackType = params.trackType;
    this._videoSourceType = params.videoSourceType;
    this._engine = engine;
    switch (this._trackType) {
      case 'ILocalTrack':
        this.__onEventTrackEnded = this.onEventTrackEnded.bind(this);
        this._track.on('track-ended', this.__onEventTrackEnded);
        break;
      case 'ILocalVideoTrack':
        this.__onEventTrackEnded = this.onEventTrackEnded.bind(this);
        this._track.on('track-ended', this.__onEventTrackEnded);
        break;
      case 'IRemoteTrack':
        this.__onEventFirstFrameDecoded = this.onEventFirstFrameDecoded.bind(
          this
        );
        this._track.on('first-frame-decoded', this.__onEventFirstFrameDecoded);
        break;
      case 'IRemoteVideoTrack':
        this.__onEventFirstFrameDecoded = this.onEventFirstFrameDecoded.bind(
          this
        );
        this._track.on('first-frame-decoded', this.__onEventFirstFrameDecoded);
        break;
      case 'IBufferSourceAudioTrack':
        this.__onEventSourceStateChange = this.onEventSourceStateChange.bind(
          this
        );
        this._track.on('source-state-change', this.__onEventSourceStateChange);
        break;
    }
  }

  async onEventTrackEnded() {
    switch (this._trackType) {
      case 'ILocalTrack':
        // 屏幕共享的case
        if (this._engine.implHelper.isScreenCapture(this._videoSourceType!)) {
          this._engine.implDispatchesMap
            .get('RtcEngine')
            ._impl.stopScreenCapture();
        }
        break;
      case 'ILocalVideoTrack':
        break;
    }
  }

  onEventSourceStateChange() {
    if (this._trackType === 'IBufferSourceAudioTrack') {
      let soundId = (this._engine.irisClientManager.getLocalAudioTrackPackageBySourceType(
        IrisAudioSourceType.kAudioSourceTypeBufferSourceAudio
      )[0] as BufferSourceAudioTrackPackage).soundId;
      this._engine.rtcEngineEventHandler.onAudioEffectFinished_46f8ab7(soundId);
    }
  }

  onEventBeautyEffectOverload() {
    //目前没有找到对应的回调
  }

  onEventFirstFrameDecoded() {
    if (!this._client) {
      return;
    }
    const irisClient = this._engine.irisClientManager.irisClientList.find(
      (item) => item.agoraRTCClient === this._client
    );
    const connection: NATIVE_RTC.RtcConnection = irisClient?.connection ?? {
      channelId: this._client.channelName,
      localUid: this._client.uid as number,
    };
    const remoteUid = this._remoteUser
      ? getUidFromRemoteUser(this._remoteUser)
      : -1;
    if (this._trackType == 'IRemoteTrack') {
      let elapsed = 0;
      this._engine.rtcEngineEventHandler.onFirstRemoteAudioDecoded_c5499bd(
        connection,
        remoteUid,
        elapsed
      );
      this._engine.rtcEngineEventHandler.onFirstRemoteAudioFrame_c5499bd(
        connection,
        remoteUid,
        elapsed
      );
    } else if (this._trackType == 'IRemoteVideoTrack') {
      let elapsed = 0;
      let width = -1;
      let height = -1;
      if (this._remoteUser?.hasVideo && this._remoteUser.videoTrack) {
        let imageData = this._remoteUser.videoTrack.getCurrentFrameData();
        width = imageData?.width || -1;
        height = imageData?.height || -1;
      }
      this._engine.rtcEngineEventHandler.onFirstRemoteVideoDecoded_a68170a(
        connection,
        remoteUid,
        width,
        height,
        elapsed
      );
      this._engine.rtcEngineEventHandler.onFirstRemoteVideoFrame_a68170a(
        connection,
        remoteUid,
        width,
        height,
        elapsed
      );
      if (width > 0 && height > 0) {
        this._engine.rtcEngineEventHandler.onVideoSizeChanged_99bf45c(
          connection,
          NATIVE_RTC.VIDEO_SOURCE_TYPE.VIDEO_SOURCE_REMOTE,
          remoteUid,
          width,
          height,
          0
        );
      }
    }
  }

  getTrack(): ITrack {
    return this._track;
  }

  getRemoteUser(): IAgoraRTCRemoteUser | undefined {
    return this._remoteUser;
  }

  getTrackType(): TrackType {
    return this._trackType;
  }

  release() {
    if (this._trackType == 'ILocalTrack') {
      let track = this._track as ILocalTrack;
      track.off('track-ended', this.__onEventTrackEnded);
    } else if (this._trackType == 'ILocalVideoTrack') {
      let track = this._track as ILocalVideoTrack;
      track.off('track-ended', this.__onEventTrackEnded);
    } else if (this._trackType == 'IRemoteTrack') {
      let track = this._track as IRemoteTrack;
      track.off('first-frame-decoded', this.__onEventFirstFrameDecoded);
    } else if (this._trackType == 'IRemoteVideoTrack') {
      let track = this._track as IRemoteVideoTrack;
      track.off('first-frame-decoded', this.__onEventFirstFrameDecoded);
    }
  }
}
