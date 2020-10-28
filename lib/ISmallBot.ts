import { SmallBot } from "./SmallBot.ts";

export interface ISmallBotConfig {
  eventHandler: (
    client: SmallBot,
    roomId: string,
    event: MatrixTimelineEvent,
  ) => Promise<void>;
  accessToken: string;
  homeserverUrl?: string;
  syncTimeout?: number;
  userId?: string;
  logger?: ISmallBotLogger;
  storeName?: string;
  store?: ISmallBotStore;
}

export interface ISmallBotLogger {
  info(log: string): void;
  error(log: string): void;
}

export interface ISmallBotStore {
  read(): string | undefined;
  write(since: string): void;
}

export interface MatrixUserProfileResponse {
  avatar_url: string;
  displayname: string;
}

export interface MatrixRoomStateResponse {
  name: string;
}

export interface MatrixWhoAmIResponse {
  user_id: string;
}

export interface MatrixJoinedRoomsResponse {
  joined_rooms: string[];
}

export interface MatrixSyncResponse {
  rooms: { join: Map<string, MatrixRoomEvent> };
  next_batch: string;
}

export interface MatrixRoomEvent {
  timeline: {
    events: MatrixTimelineEvent[];
  };
}

export interface MatrixTimelineEvent {
  content: {
    // m.room.message;
    body: string;
    msgtype: string;
    format: string;
    // m.room.message;
    formatted_body: string;
    membership: string;
    displayname: string;
    avatar_url: string;
  };
  type: string;
  event_id: string;
  sender: string;
}
