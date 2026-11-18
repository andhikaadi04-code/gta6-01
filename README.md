# Solmar Bay — an open-world crime game

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/andhikaadi04-code/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/andhikaadi04-code/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

**Solmar Bay** is an original open-world crime game in the spirit of GTA 6,
built for the [Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01).
You are Marco Reyes, a wheelman new in town. Lena Voss has work for you:
wheels to steal, packages to run, and the Solmar Bay police to outrun.

## What is in the game

- A sun-soaked coastal city to explore **on foot and by car** — streets,
  traffic, pedestrians, a beach and a pier
- **Cars to steal** — walk up to any car, take it, and drive
- A **wanted level with police** who chase, ram and try to bust you
- **Five story missions** with dialogue, objectives and rewards
- **Combat** — fists and a pistol, with club guards who shoot back
- A **HUD with a minimap**, health, money and wanted stars
- A start screen, pause, busted/wasted screens and an **autosave**
- Procedural WebAudio sound: engine, sirens, gunshots and music — no audio files

Everything is original: the city, characters, vehicles, names, story, art,
sound and music. Nothing from any commercial game.

## Play it

Serve `game/` with any static file server and open `game/index.html` in
desktop Chrome:

```sh
node serve.ts
# then open http://localhost:8080
```

No build step, no network request at runtime. three.js is vendored under
`game/vendor/`.

## Controls

| Key | Action |
|---|---|
| WASD | Walk / drive |
| Mouse (click to lock) | Look around |
| E | Steal / exit a car |
| Shift | Run |
| Space | Jump / handbrake |
| F | Punch |
| Left click | Shoot |
| R | Reload |
| P | Pause |
| M | Mute |

## License

MIT — see [LICENSE](LICENSE).
