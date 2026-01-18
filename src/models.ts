export interface GameConfig {
  LANE_WIDTH: number;
  LANE_COUNT: number;
  PLAYER_START_Y: number;
  JUMP_HEIGHT: number;
  SLIDE_Y_OFFSET: number;
  JUMP_DURATION: number;
  SLIDE_DURATION: number;
  GAME_SPEED_START: number;
  GAME_SPEED_INCREMENT: number;
  TRACK_LENGTH: number;
  PLAYER_Z_POS: number;
  HUNGER_START: number;
  HUNGER_DECAY_RATE: number;
  HUNGER_PENALTY_OBSTACLE: number;
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export type ObstacleType = 'low' | 'high';
export interface Obstacle {
  id: number;
  type: ObstacleType;
  lane: number;
  position: Position;
  emoji: string;
}

export interface Collectible {
  id: number;
  lane: number;
  position: Position;
  emoji: string;
  value: number;
}
