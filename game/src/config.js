// Shared constants for SOLMAR BAY. One job: numbers and colours, nothing else.
export const CONFIG = {
  // City layout
  BLOCK: 40,
  ROAD_W: 12,
  GRID: 7,
  CITY_HALF: 180,
  // Player
  PLAYER_WALK_SPEED: 5,
  PLAYER_RUN_SPEED: 9,
  PLAYER_JUMP: 6,
  PLAYER_HEALTH: 100,
  // Cars
  CAR_MAX_SPEED: 28,
  CAR_ACCEL: 14,
  CAR_BRAKE: 26,
  CAR_REVERSE_MAX: 10,
  CAR_TURN: 1.9,
  // Wanted / police
  WANTED_MAX: 5,
  WANTED_DECAY_SECONDS: 8,
  BUST_FINE: 200,
  // Money
  MONEY_START: 250,
  // Save
  SAVE_KEY: 'solmar-bay-save-v1',
  // Shots
  SHOT_SETTLE_MS: 6000,
};

// Sun-soaked palette: warm pastels for buildings, bright cars, deep ocean.
export const PALETTE = {
  buildings: [
    0xf2e3c6, // cream
    0xe08a5a, // terracotta
    0x5fa8a0, // teal
    0xe86a6a, // coral
    0xe8d29a, // sand
    0x9db8c4, // pale blue
    0xd9a441, // ochre
    0xc96f8e, // dusty rose
  ],
  cars: [0xd23c2e, 0xf2c230, 0x2e6fd2, 0xf2f2f2, 0x222222, 0x2ea88a, 0x7a4fd0],
  asphalt: 0x3a3f46,
  sidewalk: 0xbfb49a,
  sand: 0xe8d5a8,
  ocean: 0x2e7f9e,
  grass: 0x7fae5a,
  palmTrunk: 0x8a6b46,
  palmLeaf: 0x3f8f4f,
  lampHead: 0xffe9a8,
};
