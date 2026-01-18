// FIX: Removed HostListener from imports as it's replaced by the host property in @Component.
import { Component, ChangeDetectionStrategy, signal, WritableSignal, OnInit, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
// FIX: Added ObstacleType to the import list to resolve the type error.
import { GameConfig, Obstacle, Collectible, ObstacleType } from './models';

type GameState = 'menu' | 'playing' | 'gameOver';
type PlayerVerticalState = 'running' | 'jumping' | 'sliding';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule],
  // FIX: Replaced @HostListener decorator with the `host` property for better practice.
  host: {
    '(window:keydown)': 'handleKeydown($event)',
  },
})
export class AppComponent implements OnInit, OnDestroy {
  // Game Configuration
  config: GameConfig = {
    LANE_WIDTH: 100,
    LANE_COUNT: 3,
    PLAYER_START_Y: 0,
    JUMP_HEIGHT: -140,
    SLIDE_Y_OFFSET: 40,
    JUMP_DURATION: 500,
    SLIDE_DURATION: 400,
    GAME_SPEED_START: 8,
    GAME_SPEED_INCREMENT: 0.005,
    TRACK_LENGTH: 2000,
    PLAYER_Z_POS: 100,
    HUNGER_START: 100,
    HUNGER_DECAY_RATE: 0.05,
    HUNGER_PENALTY_OBSTACLE: 25,
  };

  // Game State Signals
  gameState: WritableSignal<GameState> = signal('menu');
  score = signal(0);
  highScore = signal(Number(localStorage.getItem('foodieRunnerHighScore') || '0'));
  gameSpeed = signal(this.config.GAME_SPEED_START);
  hunger = signal(this.config.HUNGER_START);
  isInvincible = signal(false);
  
  // Player State Signals
  playerLane = signal(1); // 0: left, 1: center, 2: right
  playerVertical = signal<PlayerVerticalState>('running');
  
  // Game Object Signals
  obstacles: WritableSignal<Obstacle[]> = signal([]);
  collectibles: WritableSignal<Collectible[]> = signal([]);

  private gameLoopId: any = null;
  private nextObjectId = 0;
  
  // Computed signals for dynamic styling
  playerXPos = computed(() => (this.playerLane() - 1) * this.config.LANE_WIDTH);
  playerYPos = computed(() => {
    switch(this.playerVertical()) {
      case 'jumping': return this.config.JUMP_HEIGHT;
      case 'sliding': return this.config.SLIDE_Y_OFFSET;
      default: return this.config.PLAYER_START_Y;
    }
  });

  playerTransform = computed(() => `translateX(${this.playerXPos()}px) translateY(${this.playerYPos()}px)`);
  playerTransitionClass = computed(() => this.playerVertical() === 'running' ? 'transition-transform duration-100 ease-linear' : 'transition-transform duration-200 ease-out');
  playerSizeClass = computed(() => this.playerVertical() === 'sliding' ? 'h-10' : 'h-20');
  playerInvincibleClass = computed(() => this.isInvincible() ? 'opacity-50 animate-pulse' : 'opacity-100');
  hungerBarClass = computed(() => {
    const h = this.hunger();
    if (h > 60) return 'bg-green-500';
    if (h > 30) return 'bg-yellow-500';
    return 'bg-red-500';
  });

  // --- Game Lifecycle Methods ---

  startGame(): void {
    this.resetGame();
    this.gameState.set('playing');
    this.gameLoopId = setInterval(() => this.gameLoop(), 1000 / 60); // 60 FPS
  }

  private gameOver(): void {
    this.gameState.set('gameOver');
    clearInterval(this.gameLoopId);
    this.gameLoopId = null;
    if (this.score() > this.highScore()) {
      this.highScore.set(this.score());
      localStorage.setItem('foodieRunnerHighScore', this.score().toString());
    }
  }

  private resetGame(): void {
    this.score.set(0);
    this.playerLane.set(1);
    this.playerVertical.set('running');
    this.obstacles.set([]);
    this.collectibles.set([]);
    this.gameSpeed.set(this.config.GAME_SPEED_START);
    this.hunger.set(this.config.HUNGER_START);
    this.isInvincible.set(false);
    this.nextObjectId = 0;
  }
  
  // --- Game Loop ---

  private gameLoop(): void {
    this.updatePositions();
    this.handleCollisions();
    this.updateHunger();
    this.cleanupObjects();
    this.generateObjects();
    this.gameSpeed.update(s => s + this.config.GAME_SPEED_INCREMENT);
  }
  
  private updateHunger(): void {
    if (this.gameState() !== 'playing') return;
    this.hunger.update(h => Math.max(0, h - this.config.HUNGER_DECAY_RATE));
    if (this.hunger() <= 0) {
      this.gameOver();
    }
  }
  
  private updatePositions(): void {
    const speed = this.gameSpeed();
    this.obstacles.update(obs => obs.map(o => ({ ...o, position: { ...o.position, z: o.position.z - speed } })));
    this.collectibles.update(cols => cols.map(c => ({ ...c, position: { ...c.position, z: c.position.z - speed } })));
  }
  
  private handleCollisions(): void {
    const pLane = this.playerLane();
    const pVertical = this.playerVertical();

    // Obstacle collision
    if (!this.isInvincible()) {
      let hitObstacle = false;
      this.obstacles.update(obs => obs.filter(obstacle => {
        if (!hitObstacle && obstacle.lane === pLane && Math.abs(obstacle.position.z - this.config.PLAYER_Z_POS) < 30) {
          if ((pVertical === 'jumping' && obstacle.type === 'low') || (pVertical === 'sliding' && obstacle.type === 'high')) {
            return true; // keep obstacle, no collision
          }
          hitObstacle = true;
          return false; // remove collided obstacle
        }
        return true; // keep other obstacles
      }));
      if (hitObstacle) {
        this.triggerStumble();
      }
    }
    
    // Collectible collision
    this.collectibles.update(cols => {
        const collectedIds = new Set<number>();
        for (const collectible of cols) {
            if (collectible.lane === pLane && Math.abs(collectible.position.z - this.config.PLAYER_Z_POS) < 40) {
                this.score.update(s => s + collectible.value);
                this.hunger.update(h => Math.min(this.config.HUNGER_START, h + collectible.value));
                collectedIds.add(collectible.id);
            }
        }
        return cols.filter(c => !collectedIds.has(c.id));
    });
  }
  
  private triggerStumble(): void {
    if (this.isInvincible()) return;
    this.hunger.update(h => Math.max(0, h - this.config.HUNGER_PENALTY_OBSTACLE));
    this.isInvincible.set(true);
    setTimeout(() => this.isInvincible.set(false), 1500); // 1.5s invincibility
  }

  private cleanupObjects(): void {
    this.obstacles.update(obs => obs.filter(o => o.position.z > -50));
    this.collectibles.update(cols => cols.filter(c => c.position.z > -50));
  }
  
  private generateObjects(): void {
    const lastZ = Math.max(
      this.obstacles().slice(-1)[0]?.position.z ?? 0,
      this.collectibles().slice(-1)[0]?.position.z ?? 0
    );

    if (lastZ < this.config.TRACK_LENGTH - 300) {
      const pattern = Math.random();
      if (pattern < 0.4) { // Obstacle
        this.addObstacle(this.config.TRACK_LENGTH);
      } else if (pattern < 0.9) { // Line of collectibles
        this.addCollectibleLine(this.config.TRACK_LENGTH);
      } else { // Mixed pattern
        this.addObstacle(this.config.TRACK_LENGTH);
        this.addCollectibleLine(this.config.TRACK_LENGTH + 200);
      }
    }
  }

  private addObstacle(z: number): void {
    const lane = Math.floor(Math.random() * this.config.LANE_COUNT);
    const type: ObstacleType = Math.random() > 0.5 ? 'high' : 'low';
    this.obstacles.update(obs => [...obs, {
      id: this.nextObjectId++,
      lane,
      type,
      emoji: type === 'high' ? '🧱' : '🚧',
      position: { x: (lane - 1) * this.config.LANE_WIDTH, y: type === 'high' ? -30 : 50, z }
    }]);
  }

  private addCollectibleLine(z: number): void {
    const lane = Math.floor(Math.random() * this.config.LANE_COUNT);
    const length = 3 + Math.floor(Math.random() * 4);
    const foodEmojis = ['🍎', '🍕', '🍔', '🍩', '🍓', '🥕'];
    this.collectibles.update(cols => {
      const newCollectibles: Collectible[] = [];
      for (let i = 0; i < length; i++) {
        newCollectibles.push({
          id: this.nextObjectId++,
          lane,
          emoji: foodEmojis[Math.floor(Math.random() * foodEmojis.length)],
          value: 10,
          position: { x: (lane - 1) * this.config.LANE_WIDTH, y: 20, z: z + i * 80 }
        });
      }
      return [...cols, ...newCollectibles];
    });
  }

  // --- Player Controls ---

  handleKeydown(event: KeyboardEvent): void {
    if (this.gameState() !== 'playing') return;

    switch (event.key) {
      case 'ArrowLeft':
      case 'a':
        this.playerLane.update(l => Math.max(0, l - 1));
        break;
      case 'ArrowRight':
      case 'd':
        this.playerLane.update(l => Math.min(this.config.LANE_COUNT - 1, l + 1));
        break;
      case 'ArrowUp':
      case 'w':
        this.jump();
        break;
      case 'ArrowDown':
      case 's':
        this.slide();
        break;
    }
  }
  
  private jump(): void {
    if (this.playerVertical() === 'running') {
      this.playerVertical.set('jumping');
      setTimeout(() => this.playerVertical.set('running'), this.config.JUMP_DURATION);
    }
  }

  private slide(): void {
    if (this.playerVertical() === 'running') {
      this.playerVertical.set('sliding');
      setTimeout(() => this.playerVertical.set('running'), this.config.SLIDE_DURATION);
    }
  }
  
  // --- Lifecycle Hooks ---

  ngOnInit() {
    // This is where you might set up touch controls if needed
  }
  
  ngOnDestroy() {
    if (this.gameLoopId) {
      clearInterval(this.gameLoopId);
    }
  }
}
