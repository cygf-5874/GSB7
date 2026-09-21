(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const mini = document.getElementById("minimapCanvas");
  const mctx = mini.getContext("2d");
  const ui = {};
  [
    "timeValue", "zoneLabel", "aliveCount", "killCount", "rankValue", "killFeed",
    "hpFill", "hpText", "levelValue", "xpFill", "goldValue", "petStatus",
    "weaponBar", "skillButton", "dashButton", "interactButton", "itemButton",
    "toast", "startOverlay", "gameOverOverlay", "resultTitle", "resultRank",
    "resultKills", "resultLevel", "resultGold"
  ].forEach(id => ui[id] = document.getElementById(id));

  const WORLD = 2800;
  const TAU = Math.PI * 2;
  const INITIAL_TIME = 300;
  const BOT_NAMES = ["赤岚", "白枭", "青鸦", "黑棘", "银狼", "绯樱", "雷隼", "苍牙", "雾鸦", "翠虎", "琥珀"];
  const weaponDefs = {
    blade: { name: "裂光刃", icon: "⚔", range: 68, arc: 1.05, damage: 26, cooldown: .42, skill: "影袭", skillCd: 4.2, color: "#ff6b7a" },
    bow: { name: "风蚀弓", icon: "🏹", range: 590, damage: 22, cooldown: .58, skill: "骤雨", skillCd: 5.4, color: "#72e7ff" },
    hammer: { name: "碎星锤", icon: "🔨", range: 78, arc: 1.28, damage: 39, cooldown: .86, skill: "震地", skillCd: 6.2, color: "#ffd166" },
    staff: { name: "世界枝杖", icon: "✦", range: 470, damage: 18, cooldown: .5, skill: "星陨", skillCd: 5.8, color: "#b68cff" }
  };
  const weaponIds = Object.keys(weaponDefs);
  const monsterDefs = [
    { name: "苔甲兽", icon: "●", color: "#7fb069", hp: 34, damage: 8, speed: 74, radius: 15, gold: 7, xp: 14, time: 8 },
    { name: "棘壳虫", icon: "◆", color: "#a98b4f", hp: 48, damage: 12, speed: 68, radius: 16, gold: 10, xp: 18, time: 10 },
    { name: "幽影狼", icon: "▲", color: "#7b8cff", hp: 66, damage: 16, speed: 104, radius: 15, gold: 15, xp: 26, time: 13 },
    { name: "炎心魔", icon: "✹", color: "#ff7a45", hp: 98, damage: 23, speed: 88, radius: 19, gold: 26, xp: 42, time: 18 }
  ];

  let dpr = 1, vw = innerWidth, vh = innerHeight, running = false, finished = false, lastTime = 0;
  let state, player, camera = { x: WORLD / 2, y: WORLD / 2 }, toastTimer = 0, feedId = 0;
  const keys = {};
  const mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };

  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function angleTo(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
  function angleDelta(a, b) { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  window.addEventListener("resize", resize);
  document.getElementById("startButton").addEventListener("click", startGame);
  document.getElementById("restartButton").addEventListener("click", startGame);
  document.getElementById("skillButton").addEventListener("click", () => running && handleAction("KeyQ"));
  document.getElementById("dashButton").addEventListener("click", () => running && handleAction("Space"));
  document.getElementById("interactButton").addEventListener("click", () => running && handleAction("KeyE"));
  document.getElementById("itemButton").addEventListener("click", () => running && handleAction("KeyR"));
  window.addEventListener("keydown", e => {
    keys[e.code] = true;
    if (["Space", "KeyQ", "KeyE", "KeyR", "KeyB", "Digit1", "Digit2", "Digit3", "Digit4"].includes(e.code)) e.preventDefault();
    if (!running) return;
    if (["KeyQ", "Space", "KeyE", "KeyR", "KeyB"].includes(e.code)) handleAction(e.code);
    if (e.code.startsWith("Digit")) {
      const index = Number(e.code.slice(5)) - 1;
      if (index < player.weapons.length) selectWeapon(index);
    }
  });
  window.addEventListener("keyup", e => keys[e.code] = false);
  canvas.addEventListener("pointermove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener("pointerdown", e => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (e.button === 2) handleAction("KeyQ");
    else mouse.down = true;
  });
  window.addEventListener("pointerup", () => mouse.down = false);
  canvas.addEventListener("contextmenu", e => e.preventDefault());

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    vw = innerWidth; vh = innerHeight;
    canvas.width = Math.floor(vw * dpr);
    canvas.height = Math.floor(vh * dpr);
    canvas.style.width = vw + "px";
    canvas.style.height = vh + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function startGame() {
    resize();
    state = {
      elapsed: 0, bots: [], players: [], monsters: [], chests: [], projectiles: [],
      effects: [], texts: [], pickups: [], decorations: [], feed: [],
      safeRadius: WORLD * .49, safeRadiusTarget: WORLD * .49, safeTimer: 18,
      monsterTimer: .8, chestTimer: 3, winner: null
    };
    finished = false;
    running = true;
    ui.startOverlay.classList.add("hidden");
    ui.gameOverOverlay.classList.add("hidden");
    ui.killFeed.innerHTML = "";
    player = makePlayer("你", true);
    player.x = WORLD / 2; player.y = WORLD - 220;
    state.players.push(player);
    BOT_NAMES.forEach((name, i) => {
      const bot = makePlayer(name, false);
      const a = i / BOT_NAMES.length * TAU + rand(-.12, .12);
      bot.x = WORLD / 2 + Math.cos(a) * rand(980, 1180);
      bot.y = WORLD / 2 + Math.sin(a) * rand(980, 1180);
      bot.weapons.push(makeWeapon(pick(["blade", "bow", "hammer"])));
      bot.activeWeapon = 0;
      bot.brain = { retarget: 0, target: null, desiredAngle: 0, wander: rand(0, TAU) };
      state.players.push(bot);
      state.bots.push(bot);
    });
    createWorld();
    for (let i = 0; i < 44; i++) spawnMonster();
    for (let i = 0; i < 22; i++) spawnChest();
    updateWeaponBar();
    showToast("开局即战：时间归零立刻出局", 2.2);
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function makeWeapon(id) {
    const base = weaponDefs[id];
    return { id, ...base, cooldownLeft: 0, skillLeft: 0 };
  }

  function makePlayer(name, human) {
    return {
      id: Math.random().toString(36).slice(2), name, human,
      x: 0, y: 0, vx: 0, vy: 0, radius: 16, angle: 0,
      hp: 100, maxHp: 100, time: INITIAL_TIME, alive: true,
      gold: 0, xp: 0, level: 1, kills: 0,
      weapons: [makeWeapon(human ? "blade" : "blade")], activeWeapon: 0,
      potions: human ? 2 : 1, bombs: 0,
      pets: [], attackLeft: 0, dashLeft: 0, dashTime: 0, hitFlash: 0, zoneTier: 0
    };
  }

  function createWorld() {
    const treeColors = ["rgba(73,111,72,.45)", "rgba(93,145,82,.45)", "rgba(113,178,96,.45)", "rgba(180,216,105,.5)"];
    for (let i = 0; i < 260; i++) {
      const a = rand(0, TAU), r = Math.sqrt(Math.random()) * WORLD * .49;
      const tier = zoneTierAt(WORLD / 2 + Math.cos(a) * r, WORLD / 2 + Math.sin(a) * r);
      state.decorations.push({
        x: WORLD / 2 + Math.cos(a) * r, y: WORLD / 2 + Math.sin(a) * r,
        radius: rand(8, 22), type: Math.random() < .72 ? "tree" : "rock",
        color: treeColors[tier]
      });
    }
  }

  function zoneTierAt(x, y) {
    const d = Math.hypot(x - WORLD / 2, y - WORLD / 2);
    if (d < 280) return 3;
    if (d < 650) return 2;
    if (d < 1000) return 1;
    return 0;
  }

  const zones = [
    { name: "外环荒原", color: "#426b4f" },
    { name: "雾蚀林地", color: "#31755f" },
    { name: "猩红腹地", color: "#8b4f5d" },
    { name: "世界树核心", color: "#d4a84e" }
  ];

  function randomPositionByTier(tier, spread = 30) {
    const ranges = [[1030, 1320], [690, 960], [320, 610], [80, 250]];
    const range = ranges[tier];
    const a = rand(0, TAU), r = rand(range[0], range[1]);
    return { x: clamp(WORLD / 2 + Math.cos(a) * r, spread, WORLD - spread), y: clamp(WORLD / 2 + Math.sin(a) * r, spread, WORLD - spread) };
  }

  function spawnMonster(tierOverride) {
    const tier = tierOverride ?? weightedTier();
    const def = monsterDefs[clamp(tier + (Math.random() < .22 ? -1 : 0), 0, 3)];
    const p = randomPositionByTier(tier, 40);
    const rare = tier > 0 && Math.random() < (tier === 3 ? .2 : tier === 2 ? .12 : .07);
    state.monsters.push({
      ...def, id: Math.random().toString(36).slice(2), x: p.x, y: p.y,
      maxHp: Math.round(def.hp * (1 + tier * .48) * (rare ? 2.2 : 1)),
      hp: 0, damage: def.damage * (1 + tier * .38) * (rare ? 1.25 : 1),
      radius: def.radius + (rare ? 5 : tier), speed: def.speed * (1 + tier * .045),
      gold: Math.round(def.gold * (1 + tier * .72) * (rare ? 2.5 : 1)),
      xp: Math.round(def.xp * (1 + tier * .65) * (rare ? 2.2 : 1)),
      time: Math.round(def.time * (1 + tier * .25) * (rare ? 1.7 : 1)),
      tier, rare, attackLeft: rand(.2, 1), wander: rand(0, TAU), wanderLeft: 0, hitFlash: 0
    });
    const m = state.monsters[state.monsters.length - 1];
    m.hp = m.maxHp;
  }

  function weightedTier() {
    const roll = Math.random();
    if (roll < .42) return 0;
    if (roll < .73) return 1;
    if (roll < .94) return 2;
    return 3;
  }

  function spawnChest() {
    const tier = weightedTier();
    const p = randomPositionByTier(tier, 50);
    const rare = Math.random() < .12 + tier * .025;
    state.chests.push({
      id: Math.random().toString(36).slice(2), x: p.x, y: p.y, tier, rare,
      radius: 17, open: false, opening: 0, respawn: 0, bob: rand(0, TAU)
    });
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min((now - lastTime) / 1000, .033);
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    state.elapsed += dt;
    updateSafeZone(dt);
    if (player.alive) updateHuman(dt);
    state.bots.forEach(bot => { if (bot.alive) updateBot(bot, dt); });
    state.players.forEach(p => {
      if (!p.alive) return;
      updateTimers(p, dt);
      p.time -= dt;
      p.zoneTier = zoneTierAt(p.x, p.y);
      applyWorldDanger(p, dt);
      moveEntity(p, dt);
      if (p.time <= 0) killPlayer(p, null, "时间耗尽，化作树界微光");
    });
    state.monsters.forEach(m => updateMonster(m, dt));
    updatePets(dt);
    updateProjectiles(dt);
    updateEffects(dt);
    updatePickups(dt);
    updateChests(dt);
    maintainSpawns(dt);
    updateCamera(dt);
    updateHud();
    checkWinner();
  }

  function updateTimers(p, dt) {
    p.attackLeft = Math.max(0, p.attackLeft - dt);
    p.dashLeft = Math.max(0, p.dashLeft - dt);
    p.dashTime = Math.max(0, p.dashTime - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt);
    p.weapons.forEach(w => {
      w.cooldownLeft = Math.max(0, w.cooldownLeft - dt);
      w.skillLeft = Math.max(0, w.skillLeft - dt);
    });
  }

  function moveEntity(e, dt, speed = 190) {
    if (e.dashTime > 0) speed = 520;
    e.x += e.vx * speed * dt;
    e.y += e.vy * speed * dt;
    e.x = clamp(e.x, 22, WORLD - 22);
    e.y = clamp(e.y, 22, 22, WORLD - 22);
    if (e.vx || e.vy) e.angle = Math.atan2(e.vy, e.vx);
  }

  function updateHuman(dt) {
    let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    let my = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    const len = Math.hypot(mx, my) || 1;
    player.vx = mx / len;
    player.vy = my / len;
    const worldMouse = screenToWorld(mouse.x, mouse.y);
    player.angle = angleTo(player, worldMouse);
    if (mouse.down) basicAttack(player);
  }

  function screenToWorld(x, y) {
    return { x: x - vw / 2 + camera.x, y: y - vh / 2 + camera.y };
  }

  function handleAction(code) {
    if (!player.alive) return;
    if (code === "KeyQ") useWeaponSkill(player);
    if (code === "Space") useDash(player);
    if (code === "KeyE") interactChest(player);
    if (code === "KeyR") usePotion(player);
    if (code === "KeyB") throwBomb(player);
  }

  function selectWeapon(index) {
    if (!player.weapons[index]) return;
    player.activeWeapon = index;
    updateWeaponBar();
  }

  function currentWeapon(p) { return p.weapons[p.activeWeapon]; }

  function basicAttack(p, forcedAngle) {
    const weapon = currentWeapon(p);
    if (!weapon || p.attackLeft > 0) return;
    p.attackLeft = weapon.cooldown;
    weapon.cooldownLeft = weapon.cooldown;
    const angle = forcedAngle ?? (p.human ? angleTo(p, screenToWorld(mouse.x, mouse.y)) : p.angle);
    if (weapon.id === "blade" || weapon.id === "hammer") meleeHit(p, weapon, angle, 1, 0);
    if (weapon.id === "bow") fireProjectile(p, { x: Math.cos(angle), y: Math.sin(angle) }, weapon.damage, 640, .72, 6, weapon.color, weapon.name);
    if (weapon.id === "staff") fireProjectile(p, { x: Math.cos(angle), y: Math.sin(angle) }, weapon.damage, 500, .8, 8, weapon.color, weapon.name, { burn: true });
    addEffect(p.x + Math.cos(angle) * 18, p.y + Math.sin(angle) * 18, "muzzle", weapon.color, .16, { angle });
  }

  function meleeHit(owner, weapon, angle, multiplier, offset) {
    addEffect(owner.x, owner.y, "slash", weapon.color, .28, { angle, range: weapon.range + offset, arc: weapon.arc });
    enemiesOf(owner).forEach(target => {
      const d = dist(owner, target);
      const delta = Math.abs(angleDelta(angle, angleTo(owner, target)));
      if (d < weapon.range + target.radius + offset && delta < weapon.arc / 2 + .22) {
        damageTarget(target, weapon.damage * multiplier, owner, weapon.name);
        if (weapon.id === "hammer") {
          target.x += Math.cos(angle) * 18;
          target.y += Math.sin(angle) * 18;
        }
      }
    });
  }

  function useWeaponSkill(p) {
    const weapon = currentWeapon(p);
    if (!weapon || weapon.skillLeft > 0) return;
    weapon.skillLeft = weapon.skillCd;
    const angle = p.human ? angleTo(p, screenToWorld(mouse.x, mouse.y)) : p.angle;
    if (weapon.id === "blade") {
      useDash(p, true);
      meleeHit(p, weapon, angle, 2.15, 32);
      meleeHit(p, weapon, angle, 1.35, 56);
    }
    if (weapon.id === "bow") {
      for (let i = -2; i <= 2; i++) {
        const a = angle + i * .13;
        fireProjectile(p, { x: Math.cos(a), y: Math.sin(a) }, weapon.damage * .72, 720, .62, 5, weapon.color, weapon.skill);
      }
    }
    if (weapon.id === "hammer") {
      addEffect(p.x, p.y, "nova", weapon.color, .42, { range: 165 });
      enemiesOf(p).forEach(t => {
        if (dist(p, t) < 165 + t.radius) {
          damageTarget(t, weapon.damage * 1.8, p, weapon.skill);
          const a = angleTo(p, t);
          t.x += Math.cos(a) * 34; t.y += Math.sin(a) * 34;
        }
      });
    }
    if (weapon.id === "staff") {
      for (let i = 0; i < 5; i++) {
        const a = angle + rand(-.45, .45);
        fireProjectile(p, { x: Math.cos(a), y: Math.sin(a) }, weapon.damage * 1.2, 560, .9, 10, weapon.color, weapon.skill, { burn: true, homing: true });
      }
    }
    if (p.human) showToast(`${weapon.name} · ${weapon.skill}`, 1);
  }

  function useDash(p, free = false) {
    if (!free && p.dashLeft > 0) return;
    let dx = p.vx || Math.cos(p.angle), dy = p.vy || Math.sin(p.angle);
    if (p.human) {
      const t = screenToWorld(mouse.x, mouse.y);
      dx = Math.cos(angleTo(p, t)); dy = Math.sin(angleTo(p, t));
    }
    const n = Math.hypot(dx, dy) || 1;
    p.vx = dx / n; p.vy = dy / n;
    p.dashTime = free ? .24 : .17;
    if (!free) p.dashLeft = 2.1;
    addEffect(p.x, p.y, "dash", "#7df9ff", .32, { angle: p.angle });
  }

  function fireProjectile(owner, dir, damage, speed, life, radius, color, name, extra = {}) {
    const n = Math.hypot(dir.x, dir.y) || 1;
    state.projectiles.push({
      id: Math.random().toString(36).slice(2), owner,
      x: owner.x + dir.x / n * (owner.radius + 8), y: owner.y + dir.y / n * (owner.radius + 8),
      vx: dir.x / n * speed, vy: dir.y / n * speed, damage, radius, color, life, maxLife: life,
      name, burn: !!extra.burn, homing: !!extra.homing
    });
  }

  function enemiesOf(p) {
    return [
      ...state.players.filter(q => q.alive && q !== p),
      ...state.monsters.filter(m => m.hp > 0)
    ];
  }

  function damageTarget(target, amount, source, label) {
    if (target.weapons) damagePlayer(target, amount, source, label);
    else damageMonster(target, amount, source, label);
  }

  function damagePlayer(p, amount, source, label) {
    if (!p.alive) return;
    p.hp -= amount;
    p.hitFlash = .18;
    addText(p.x, p.y - 26, `-${Math.round(amount)}`, "#ff7b87");
    if (p.hp <= 0) killPlayer(p, source, label);
  }

  function damageMonster(m, amount, source) {
    if (m.hp <= 0) return;
    m.hp -= amount;
    m.hitFlash = .12;
    m.aggro = source;
    addText(m.x, m.y - m.radius - 8, `-${Math.round(amount)}`, "#fff1b8");
    if (m.hp <= 0) killMonster(m, source);
  }

  function killMonster(m, source) {
    m.hp = 0;
    addEffect(m.x, m.y, "death", m.color, .45, { radius: m.radius });
    if (source && source.weapons) {
      source.kills = (source.kills || 0) + 1;
      grantXp(source, m.xp);
      source.gold += m.gold;
      if (source.human) showToast(`击败 ${m.name}  +${m.gold} 金币`, 1.1);
    }
    spawnPickup(m.x, m.y, "time", m.time, source);
    spawnPickup(m.x + rand(-18, 18), m.y + rand(-18, 18), "gold", Math.round(m.gold * .55), source);
    if (m.rare) {
      spawnPickup(m.x, m.y, "weapon", m.tier, source);
      if (source && source.alive && source.pets.length < 1) tameMonster(source, m);
    } else if (Math.random() < .055 + m.tier * .025) {
      spawnPickup(m.x, m.y, "weapon", m.tier, source);
    }
    state.monsters = state.monsters.filter(q => q !== m);
  }

  function tameMonster(owner, m) {
    const pet = {
      id: Math.random().toString(36).slice(2), name: `契约·${m.name}`, owner,
      x: owner.x + rand(-28, 28), y: owner.y + rand(-28, 28), radius: 13,
      color: m.color, damage: m.damage * .75, attackLeft: 0, angle: 0
    };
    owner.pets.push(pet);
    addEffect(owner.x, owner.y, "nova", "#8cffcb", .7, { range: 90 });
    if (owner.human) showToast(`稀有怪兽成为伙伴：${pet.name}`, 2.2);
  }

  function grantXp(p, amount) {
    p.xp += amount;
    let need = xpNeed(p.level);
    while (p.xp >= need) {
      p.xp -= need;
      p.level += 1;
      p.maxHp += 14;
      p.hp = Math.min(p.maxHp, p.hp + 35);
      need = xpNeed(p.level);
      p.weapons.forEach(w => {
        w.damage += 1.5;
      });
      addEffect(p.x, p.y, "levelup", "#b68cff", .8, { range: 70 });
      if (p.human) showToast(`等级提升至 ${p.level}，武器伤害提高`, 1.6);
    }
  }

  function xpNeed(level) { return 55 + (level - 1) * 38; }

  function spawnPickup(x, y, type, value, preferred) {
    state.pickups.push({ id: Math.random().toString(36).slice(2), x, y, type, value, preferred, radius: 12, life: 22, bob: rand(0, TAU) });
  }

  function updatePickups(dt) {
    state.pickups.forEach(item => {
      item.life -= dt;
      item.bob += dt * 4;
      let target = null;
      if (item.preferred && item.preferred.alive && dist(item, item.preferred) < 150) target = item.preferred;
      if (!target) target = state.players.find(p => p.alive && dist(item, p) < 38);
      if (target) {
        if (dist(item, target) > 16) {
          const a = angleTo(item, target);
          item.x += Math.cos(a) * 240 * dt;
          item.y += Math.sin(a) * 240 * dt;
        } else collectPickup(target, item);
      }
    });
    state.pickups = state.pickups.filter(i => i.life > 0 && !i.taken);
  }

  function collectPickup(p, item) {
    item.taken = true;
    if (item.type === "time") {
      p.time = Math.min(390, p.time + item.value);
      addText(p.x, p.y - 32, `+${item.value} 秒`, "#7df9ff");
      if (p.human) showToast(`获得 ${item.value} 秒生存时间`, 1);
    }
    if (item.type === "gold") {
      p.gold += item.value;
      addText(item.x, item.y - 10, `+${item.value}`, "#ffd166");
    }
    if (item.type === "potion") {
      p.potions += 1;
      if (p.human) showToast("获得治疗药剂", 1);
    }
    if (item.type === "bomb") {
      p.bombs += 1;
      if (p.human) showToast("获得爆裂雷囊（B 键使用）", 1);
    }
    if (item.type === "weapon") grantWeapon(p, item.value);
  }

  function grantWeapon(p, tier) {
    const roll = Math.random();
    let id = "blade";
    if (tier >= 2 && roll < .28) id = "staff";
    else if (roll < .45) id = "hammer";
    else if (roll < .75) id = "bow";
    const existing = p.weapons.find(w => w.id === id);
    if (existing) {
      existing.damage += 3 + tier;
      if (p.human) showToast(`${existing.name} 强化 +${3 + tier}`, 1.2);
      return;
    }
    if (p.weapons.length >= 4) {
      const weakest = p.weapons.reduce((a, b) => a.damage < b.damage ? a : b);
      const index = p.weapons.indexOf(weakest);
      p.weapons[index] = makeWeapon(id);
      p.activeWeapon = index;
    } else {
      p.weapons.push(makeWeapon(id));
      p.activeWeapon = p.weapons.length - 1;
    }
    if (p.human) {
      updateWeaponBar();
      showToast(`获得武器：${weaponDefs[id].name}`, 1.5);
    }
  }

  function killPlayer(p, source, reason) {
    if (!p.alive) return;
    p.alive = false;
    p.hp = 0;
    p.vx = 0; p.vy = 0;
    addEffect(p.x, p.y, "death", "#ff5a68", .8, { radius: 28 });
    if (source && source !== p && source.weapons) {
      const stolen = Math.max(1, Math.round(p.time / 2));
      source.time = Math.min(390, source.time + stolen);
      source.gold += Math.round(p.gold * .25);
      source.kills += 1;
      addFeed(`<b>${source.name}</b> 掠夺 <b>${p.name}</b> 的 ${stolen} 秒`, false);
      if (source.human) showToast(`击败 ${p.name}，夺取 ${stolen} 秒`, 1.8);
    } else {
      addFeed(`<b>${p.name}</b> ${reason || "出局"}`, false);
    }
    if (p.human) endGame(false);
  }

  function addFeed(html, system = false) {
    const el = document.createElement("div");
    el.className = "feed" + (system ? " system" : "");
    el.innerHTML = html;
    ui.killFeed.prepend(el);
    while (ui.killFeed.children.length > 7) ui.killFeed.lastChild.remove();
    setTimeout(() => el.remove(), 6500);
  }

  function usePotion(p) {
    if (p.potions <= 0 || p.hp >= p.maxHp) {
      if (p.human) showToast(p.potions <= 0 ? "没有治疗药剂" : "生命值已满", 1);
      return;
    }
    p.potions -= 1;
    p.hp = Math.min(p.maxHp, p.hp + 48);
    addEffect(p.x, p.y, "heal", "#52e69a", .65, { range: 48 });
    addText(p.x, p.y - 28, "+48", "#52e69a");
  }

  function throwBomb(p) {
    if (p.bombs <= 0) {
      if (p.human) showToast("没有爆裂雷囊", 1);
      return;
    }
    p.bombs -= 1;
    const angle = p.human ? angleTo(p, screenToWorld(mouse.x, mouse.y)) : p.angle;
    state.effects.push({
      type: "bomb", x: p.x + Math.cos(angle) * 70, y: p.y + Math.sin(angle) * 70,
      color: "#ff9f1c", life: .55, maxLife: .55, radius: 10, owner: p, exploded: false
    });
  }

  function updateMonster(m, dt) {
    m.hitFlash = Math.max(0, m.hitFlash - dt);
    m.attackLeft -= dt;
    const players = state.players.filter(p => p.alive);
    let target = m.aggro && m.aggro.alive ? m.aggro : null;
    if (!target || dist(m, target) > 430) {
      let nearest = null, nd = 340;
      players.forEach(p => {
        const d = dist(m, p);
        if (d < nd) { nd = d; nearest = p; }
      });
      target = nearest;
    }
    if (target) {
      const a = angleTo(m, target), d = dist(m, target);
      m.angle = a;
      if (d > m.radius + target.radius + 8) {
        m.x += Math.cos(a) * m.speed * dt;
        m.y += Math.sin(a) * m.speed * dt;
      } else if (m.attackLeft <= 0) {
        m.attackLeft = Math.max(.72, 1.25 - m.tier * .08);
        damagePlayer(target, m.damage, m, m.name);
        addEffect(target.x, target.y, "hit", m.color, .2, {});
      }
    } else {
      m.wanderLeft -= dt;
      if (m.wanderLeft <= 0) { m.wander = rand(0, TAU); m.wanderLeft = rand(1.2, 2.8); }
      m.x += Math.cos(m.wander) * m.speed * .28 * dt;
      m.y += Math.sin(m.wander) * m.speed * .28 * dt;
    }
    m.x = clamp(m.x, 25, WORLD - 25);
    m.y = clamp(m.y, 25, WORLD - 25);
  }

  function updatePets(dt) {
    state.players.forEach(owner => {
      if (!owner.alive) owner.pets.length = 0;
      owner.pets.forEach(pet => {
        pet.attackLeft = Math.max(0, pet.attackLeft - dt);
        const target = nearestEntity(pet, state.monsters, 520);
        let tx = owner.x + Math.cos(owner.angle + 2.4) * 34;
        let ty = owner.y + Math.sin(owner.angle + 2.4) * 34;
        if (target && dist(pet, target) < 470) {
          tx = target.x; ty = target.y;
          pet.angle = angleTo(pet, target);
          if (dist(pet, target) < 190 && pet.attackLeft <= 0) {
            pet.attackLeft = 1.05;
            firePetBolt(pet, target, owner);
          }
        } else {
          pet.angle = angleTo(pet, { x: tx, y: ty });
        }
        const d = Math.hypot(tx - pet.x, ty - pet.y);
        if (d > 22) {
          pet.x += (tx - pet.x) / d * 250 * dt;
          pet.y += (ty - pet.y) / d * 250 * dt;
        }
      });
    });
  }

  function firePetBolt(pet, target, owner) {
    const a = angleTo(pet, target);
    state.projectiles.push({
      id: Math.random().toString(36).slice(2), owner, pet,
      x: pet.x, y: pet.y, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430,
      damage: pet.damage, radius: 6, color: pet.color, life: .9, maxLife: .9, name: "伙伴协击"
    });
  }

  function nearestEntity(from, list, maxDistance) {
    let best = null, bestDistance = maxDistance;
    list.forEach(e => {
      if (e.hp !== undefined && e.hp <= 0) return;
      const d = dist(from, e);
      if (d < bestDistance) { bestDistance = d; best = e; }
    });
    return best;
  }

  function updateProjectiles(dt) {
    state.projectiles.forEach(pr => {
      pr.life -= dt;
      if (pr.homing) {
        const target = nearestEntity(pr, state.monsters, 260);
        if (target) {
          const a = angleTo(pr, target), speed = Math.hypot(pr.vx, pr.vy);
          pr.vx += Math.cos(a) * speed * 1.8 * dt;
          pr.vy += Math.sin(a) * speed * 1.8 * dt;
          const n = Math.hypot(pr.vx, pr.vy) || 1;
          pr.vx = pr.vx / n * speed; pr.vy = pr.vy / n * speed;
        }
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      const targets = pr.pet ? state.monsters : [...state.monsters, ...state.players.filter(p => p.alive && p !== pr.owner)];
      targets.some(target => {
        if (target.hp !== undefined && target.hp <= 0) return false;
        if (dist(pr, target) <= pr.radius + target.radius) {
          if (pr.pet) damageMonster(target, pr.damage, pr.owner);
          else if (target.weapons) damagePlayer(target, pr.damage, pr.owner, pr.name);
          else damageMonster(target, pr.damage, pr.owner);
          addEffect(pr.x, pr.y, "spark", pr.color, .18, {});
          pr.life = 0;
          return true;
        }
        return false;
      });
    });
    state.projectiles = state.projectiles.filter(p => p.life > 0 && p.x > 0 && p.y > 0 && p.x < WORLD && p.y < WORLD);
  }

  function addEffect(x, y, type, color, life, data = {}) {
    state.effects.push({ x, y, type, color, life, maxLife: life, ...data });
  }

  function addText(x, y, text, color) {
    state.texts.push({ x, y, text, color, life: .9, maxLife: .9 });
  }

  function updateEffects(dt) {
    state.effects.forEach(e => {
      e.life -= dt;
      if (e.type === "bomb" && e.life <= 0 && !e.exploded) {
        e.exploded = true;
        e.type = "explosion";
        e.life = .38;
        e.maxLife = .38;
        e.range = 135;
        addFeed(`<b>${e.owner.name}</b> 引爆了雷囊`, true);
        [...state.monsters, ...state.players].forEach(t => {
          if (t === e.owner || t.alive === false || t.hp <= 0) return;
          if (dist(e, t) < 135 + t.radius) damageTarget(t, 72, e.owner, "爆裂雷囊");
        });
      }
    });
    state.effects = state.effects.filter(e => e.life > 0);
    state.texts.forEach(t => { t.life -= dt; t.y -= 34 * dt; });
    state.texts = state.texts.filter(t => t.life > 0);
  }

  function interactChest(p) {
    const chest = state.chests.find(c => !c.open && dist(p, c) < 58);
    if (!chest) {
      if (p.human) showToast("附近没有可开启的宝箱", 1);
      return;
    }
    openChest(chest, p);
  }

  function openChest(chest, p) {
    chest.open = true;
    chest.respawn = chest.rare ? 24 : 17;
    addEffect(chest.x, chest.y, "chest", chest.rare ? "#ffd166" : "#8cffcb", .7, { range: 80 });
    const timeBonus = (chest.rare ? 42 : 20) + chest.tier * 7;
    const gold = (chest.rare ? 55 : 16) + chest.tier * 16;
    spawnPickup(chest.x, chest.y, "time", timeBonus, p);
    spawnPickup(chest.x + 18, chest.y - 8, "gold", gold, p);
    if (Math.random() < (chest.rare ? 1 : .38 + chest.tier * .08)) spawnPickup(chest.x - 18, chest.y + 8, "weapon", Math.min(3, chest.tier + (chest.rare ? 1 : 0)), p);
    if (Math.random() < .42) spawnPickup(chest.x + 8, chest.y + 18, "potion", 1, p);
    if (chest.rare) spawnPickup(chest.x - 8, chest.y - 18, "bomb", 1, p);
    if (p.human) showToast(`${chest.rare ? "稀有宝箱" : "宝箱"}开启：时间、金币与装备出现`, 1.5);
  }

  function updateChests(dt) {
    state.chests.forEach(c => {
      c.bob += dt * 3;
      if (c.open) {
        c.respawn -= dt;
        if (c.respawn <= 0) {
          const p = randomPositionByTier(weightedTier(), 50);
          c.open = false;
          c.x = p.x; c.y = p.y;
          c.tier = weightedTier();
          c.rare = Math.random() < .13 + c.tier * .025;
        }
      }
    });
  }

  function updateSafeZone(dt) {
    if (state.elapsed < 20) return;
    state.safeRadiusTarget = clamp(1260 - (state.elapsed - 20) * 7.2, 190, 1260);
    state.safeRadius += (state.safeRadiusTarget - state.safeRadius) * Math.min(1, dt * .7);
  }

  function applyWorldDanger(p, dt) {
    const d = Math.hypot(p.x - WORLD / 2, p.y - WORLD / 2);
    p.outsideSafe = d > state.safeRadius;
    if (p.outsideSafe) {
      p.hp -= (7 + state.elapsed / 45) * dt;
      p.hitFlash = Math.max(p.hitFlash, .08);
      if (Math.random() < dt * 1.2) addText(p.x, p.y - 30, "界域侵蚀", "#ff7b87");
      if (p.hp <= 0) killPlayer(p, null, "被界域外的混沌侵蚀");
    }
  }

  function maintainSpawns(dt) {
    state.monsterTimer -= dt;
    state.chestTimer -= dt;
    if (state.monsterTimer <= 0) {
      state.monsterTimer = 1.1;
      if (state.monsters.length < 44) spawnMonster();
    }
    if (state.chestTimer <= 0) {
      state.chestTimer = 2.5;
      if (state.chests.filter(c => !c.open).length < 18) spawnChest();
    }
  }

  function checkWinner() {
    if (state.elapsed >= 300 && !finished) {
      const ranked = state.players.filter(p => p.alive).sort((a, b) => b.time - a.time);
      const winner = ranked[0];
      const playerRank = ranked.findIndex(p => p === player) + 1;
      ranked.slice(1).forEach(p => {
        p.alive = false;
        p.hp = 0;
      });
      if (winner) {
        finished = true;
        addFeed(`<b>${winner.name}</b> 在五分钟终局持有最多时间`, true);
        endGame(winner === player, winner, playerRank);
      }
      return;
    }
    const alive = state.players.filter(p => p.alive);
    if (alive.length <= 1 && !finished) {
      finished = true;
      const winner = alive[0];
      state.winner = winner;
      if (winner) addFeed(`<b>${winner.name}</b> 成为最后的时间持有者`, true);
      endGame(winner && winner === player, winner);
    }
  }

  function endGame(victory, winner, finalRank) {
    if (!running) return;
    running = false;
    const rank = victory ? 1 : (finalRank || state.players.filter(p => p.alive).length + 1);
    ui.resultTitle.textContent = victory ? "胜利：时间树认可了你" : "你被淘汰了";
    ui.resultRank.textContent = `#${rank}`;
    ui.resultKills.textContent = player.kills;
    ui.resultLevel.textContent = player.level;
    ui.resultGold.textContent = player.gold;
    ui.gameOverOverlay.classList.remove("hidden");
  }

  function updateBot(bot, dt) {
    bot.brain.retarget -= dt;
    if (bot.brain.retarget <= 0 || !bot.brain.target || bot.brain.target.hp <= 0 || bot.brain.target.alive === false) {
      bot.brain.retarget = rand(.25, .55);
      bot.brain.target = chooseBotTarget(bot);
    }
    if (bot.hp < bot.maxHp * .34 && bot.potions > 0) usePotion(bot);
    const target = bot.brain.target;
    let goal = null;
    if (target) {
      goal = { x: target.x, y: target.y };
      const d = dist(bot, target);
      bot.angle = angleTo(bot, target);
      const weapon = currentWeapon(bot);
      const attackRange = weapon && (weapon.id === "blade" || weapon.id === "hammer") ? weapon.range * .82 : weapon.range * .72;
      if (d < attackRange && (!target.open || target.open === false)) {
        basicAttack(bot, bot.angle);
        if (weapon && weapon.skillLeft <= 0 && (target.weapons || d < 240) && Math.random() < .55) useWeaponSkill(bot);
      }
      if (target.open === false && d < 52) openChest(target, bot);
      if (target.weapons && bot.hp < bot.maxHp * .55 && d < 120) goal = fleePoint(bot, target);
    }
    const centerDistance = Math.hypot(bot.x - WORLD / 2, bot.y - WORLD / 2);
    if (centerDistance > state.safeRadius - 40) goal = { x: WORLD / 2, y: WORLD / 2 };
    if (!goal || bot.time < 55) {
      const urgentChest = nearestEntity(bot, state.chests.filter(c => !c.open), 760);
      if (urgentChest) goal = urgentChest;
      else goal = inwardGoal(bot, centerDistance);
    }
    if (!target && bot.level >= 2 && centerDistance > 360 && Math.random() < dt * .55) {
      goal = inwardGoal(bot, centerDistance);
    }
    const a = angleTo(bot, goal);
    const wobble = Math.sin(state.elapsed * 2.1 + bot.x * .01) * .22;
    bot.vx = Math.cos(a + wobble);
    bot.vy = Math.sin(a + wobble);
    if (Math.random() < dt * .08) bot.brain.wander = rand(0, TAU);
  }

  function chooseBotTarget(bot) {
    const candidates = [];
    state.players.forEach(p => {
      if (p !== bot && p.alive) {
        const d = dist(bot, p);
        const earlyGame = state.elapsed < 30;
        const revenge = bot.aggro === p;
        const willing = !earlyGame || revenge || (d < 150 && bot.hp > p.hp * 1.35) || bot.time < 75;
        let score = (bot.hp > p.hp ? 220 : 0) + (d < 170 ? 280 : 0) - d * .38;
        if (earlyGame) score *= .22;
        if (willing && d < 360) candidates.push({ e: p, score });
      }
    });
    state.monsters.forEach(m => {
      const d = dist(bot, m);
      const safeTier = bot.level >= 3 ? m.tier <= 3 : m.tier <= Math.max(1, bot.level);
      if (d < 340 && safeTier) {
        candidates.push({ e: m, score: 145 + m.time * 5 - d * .22 - m.tier * 20 });
      }
    });
    state.chests.forEach(c => {
      if (c.open) return;
      const d = dist(bot, c);
      if (d < 430) candidates.push({ e: c, score: (c.rare ? 260 : 145) + c.tier * 20 - d * .18 });
    });
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.e || null;
  }

  function fleePoint(runner, threat) {
    const a = angleTo(threat, runner);
    return { x: runner.x + Math.cos(a) * 210, y: runner.y + Math.sin(a) * 210 };
  }

  function inwardGoal(bot, centerDistance) {
    const a = Math.atan2(bot.y - WORLD / 2, bot.x - WORLD / 2);
    const targetRadius = clamp(1120 - bot.level * 180 - Math.max(0, bot.time - 180) * 1.4, 230, 1040);
    return {
      x: WORLD / 2 + Math.cos(a + bot.brain.wander * .12) * targetRadius,
      y: WORLD / 2 + Math.sin(a + bot.brain.wander * .12) * targetRadius
    };
  }

  function updateCamera(dt) {
    const follow = player.alive ? player : { x: WORLD / 2, y: WORLD / 2 };
    camera.x += (follow.x - camera.x) * Math.min(1, dt * 7);
    camera.y += (follow.y - camera.y) * Math.min(1, dt * 7);
    camera.x = clamp(camera.x, Math.min(vw / 2, WORLD / 2), Math.max(vw / 2, WORLD - vw / 2));
    camera.y = clamp(camera.y, Math.min(vh / 2, WORLD / 2), Math.max(vh / 2, WORLD - vh / 2));
  }

  function formatTime(seconds) {
    const value = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(value / 60);
    const s = value % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function showToast(text, duration = 1.5) {
    const el = document.createElement("div");
    el.className = "toast-message";
    el.textContent = text;
    ui.toast.appendChild(el);
    setTimeout(() => el.remove(), duration * 1000);
  }

  function updateWeaponBar() {
    ui.weaponBar.innerHTML = "";
    player.weapons.forEach((w, i) => {
      const slot = document.createElement("div");
      slot.className = "weapon-slot" + (i === player.activeWeapon ? " active" : "");
      slot.innerHTML = `<span class="key">${i + 1}</span><span class="icon">${w.icon}</span><strong>${w.name}</strong><small>${w.skill} · Q</small><span class="cooldown"></span>`;
      slot.addEventListener("click", () => selectWeapon(i));
      ui.weaponBar.appendChild(slot);
    });
  }

  function updateHud() {
    const alive = state.players.filter(p => p.alive);
    ui.timeValue.textContent = formatTime(player.time);
    ui.timeValue.classList.toggle("danger", player.time < 45);
    ui.zoneLabel.textContent = zones[player.zoneTier].name + (player.outsideSafe ? " · 安全区外" : "");
    ui.aliveCount.textContent = alive.length;
    ui.killCount.textContent = player.kills;
    const rank = player.alive ? 1 + alive.filter(p => p.time > player.time).length : alive.length + 1;
    ui.rankValue.textContent = rank;
    ui.hpFill.style.width = `${clamp(player.hp / player.maxHp * 100, 0, 100)}%`;
    ui.hpText.textContent = Math.max(0, Math.ceil(player.hp));
    ui.levelValue.textContent = player.level;
    ui.xpFill.style.width = `${clamp(player.xp / xpNeed(player.level) * 100, 0, 100)}%`;
    ui.goldValue.textContent = `◆ ${player.gold}`;
    ui.petStatus.textContent = player.pets.length ? player.pets[0].name : "尚未契约稀有伙伴";
    ui.itemButton.querySelector("span").textContent = `药剂 ${player.potions}`;
    const weapon = currentWeapon(player);
    ui.skillButton.querySelector("span").textContent = weapon ? weapon.skill : "技能";
    [ui.skillButton, ui.dashButton, ui.interactButton, ui.itemButton].forEach(b => {
      b.classList.add("ready");
      b.classList.remove("oncooldown");
    });
    if (weapon && weapon.skillLeft > 0) {
      ui.skillButton.classList.add("oncooldown");
      ui.skillButton.querySelector("b").textContent = Math.ceil(weapon.skillLeft);
    } else ui.skillButton.querySelector("b").textContent = "Q";
    ui.dashButton.querySelector("b").textContent = player.dashLeft > 0 ? Math.ceil(player.dashLeft) : "↯";
    [...ui.weaponBar.children].forEach((slot, i) => {
      const w = player.weapons[i];
      const cd = slot.querySelector(".cooldown");
      if (w && w.skillLeft > 0) {
        cd.style.display = "grid";
        cd.textContent = Math.ceil(w.skillLeft);
      } else cd.style.display = "none";
    });
  }

  function render() {
    ctx.clearRect(0, 0, vw, vh);
    ctx.save();
    ctx.translate(vw / 2 - camera.x, vh / 2 - camera.y);
    drawWorld();
    drawDecorations();
    state.chests.forEach(drawChest);
    state.pickups.forEach(drawPickup);
    state.monsters.forEach(drawMonster);
    state.players.forEach(drawPlayer);
    state.players.forEach(p => p.alive && p.pets.forEach(drawPet));
    state.projectiles.forEach(drawProjectile);
    state.effects.forEach(drawEffect);
    state.texts.forEach(drawFloatingText);
    ctx.restore();
    drawScreenEdges();
    drawMinimap();
  }

  function drawWorld() {
    const bg = ctx.createRadialGradient(WORLD / 2, WORLD / 2, 60, WORLD / 2, WORLD / 2, WORLD * .72);
    bg.addColorStop(0, "#d9a84e");
    bg.addColorStop(.18, "#725264");
    bg.addColorStop(.42, "#2f6f58");
    bg.addColorStop(.78, "#183e33");
    bg.addColorStop(1, "#081613");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WORLD, WORLD);

    const ringColors = ["rgba(255,255,255,.025)", "rgba(255,255,255,.04)"];
    for (let r = 1320; r > 0; r -= 320) {
      ctx.beginPath();
      ctx.arc(WORLD / 2, WORLD / 2, r, 0, TAU);
      ctx.fillStyle = ringColors[(r / 320) % 2 | 0];
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(225,255,239,.09)";
    ctx.lineWidth = 2;
    [280, 650, 1000, 1360].forEach(r => {
      ctx.beginPath();
      ctx.arc(WORLD / 2, WORLD / 2, r, 0, TAU);
      ctx.stroke();
    });
    ctx.strokeStyle = "#d8fff0";
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, WORLD - 8, WORLD - 8);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WORLD, WORLD);
    ctx.arc(WORLD / 2, WORLD / 2, state.safeRadius, 0, TAU, true);
    ctx.fillStyle = "rgba(3, 8, 9, .35)";
    ctx.fill("evenodd");
    ctx.restore();

    ctx.beginPath();
    ctx.arc(WORLD / 2, WORLD / 2, state.safeRadius, 0, TAU);
    ctx.strokeStyle = "rgba(110,231,255,.75)";
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 13]);
    ctx.stroke();
    ctx.setLineDash([]);

    drawWorldTree();
  }

  function drawWorldTree() {
    const pulse = 1 + Math.sin(state.elapsed * 2.2) * .04;
    ctx.save();
    ctx.translate(WORLD / 2, WORLD / 2);
    const glow = ctx.createRadialGradient(0, 0, 10, 0, 0, 210 * pulse);
    glow.addColorStop(0, "rgba(255,242,180,.75)");
    glow.addColorStop(.35, "rgba(125,255,184,.26)");
    glow.addColorStop(1, "rgba(125,255,184,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 215 * pulse, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#8a5a35";
    ctx.lineWidth = 18;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(a) * 55, Math.sin(a) * 55, Math.cos(a) * 112, Math.sin(a) * 112);
      ctx.stroke();
    }
    ctx.fillStyle = "#eaffcf";
    ctx.beginPath();
    ctx.arc(0, 0, 24 * pulse, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawDecorations() {
    const margin = 120;
    state.decorations.forEach(d => {
      if (!inView(d, 160)) return;
      ctx.save();
      ctx.translate(d.x, d.y);
      if (d.type === "tree") {
        ctx.fillStyle = "rgba(0,0,0,.18)";
        ctx.beginPath(); ctx.ellipse(4, 7, d.radius * 1.25, d.radius * .7, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#5d3d2a";
        ctx.fillRect(-3, -3, 6, 18);
        ctx.fillStyle = d.color;
        ctx.beginPath(); ctx.arc(0, -8, d.radius, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.08)";
        ctx.beginPath(); ctx.arc(-d.radius * .25, -d.radius * .28, d.radius * .45, 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = "#6f756d";
        ctx.beginPath();
        ctx.moveTo(-d.radius, d.radius * .5);
        ctx.lineTo(-d.radius * .45, -d.radius * .7);
        ctx.lineTo(d.radius * .7, -d.radius * .45);
        ctx.lineTo(d.radius, d.radius * .55);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function inView(e, padding = 60) {
    return e.x > camera.x - vw / 2 - padding && e.x < camera.x + vw / 2 + padding &&
      e.y > camera.y - vh / 2 - padding && e.y < camera.y + vh / 2 + padding;
  }

  function drawChest(c) {
    if (!inView(c, 100)) return;
    const bob = c.open ? 0 : Math.sin(c.bob) * 3;
    ctx.save();
    ctx.translate(c.x, c.y + bob);
    if (c.rare && !c.open) {
      ctx.shadowColor = "#ffd166";
      ctx.shadowBlur = 18;
    }
    ctx.fillStyle = c.open ? "#4d5a54" : c.rare ? "#9a6d20" : "#7a512b";
    ctx.fillRect(-17, -10, 34, 24);
    ctx.fillStyle = c.open ? "#2d3632" : c.rare ? "#ffd166" : "#a9d6a0";
    ctx.fillRect(-17, -18, 34, 10);
    ctx.fillStyle = "#191c1a";
    ctx.fillRect(-3, -7, 6, 10);
    if (!c.open && c.rare) {
      ctx.fillStyle = "#fff3b0";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("★", 0, -25);
    }
    ctx.restore();
  }

  function drawPickup(item) {
    if (!inView(item)) return;
    const fade = item.life < 3 ? Math.sin(item.life * 10) > 0 ? 1 : .35 : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(item.x, item.y + Math.sin(item.bob) * 3);
    if (item.type === "time") {
      ctx.fillStyle = "#6ee7ff";
      ctx.shadowColor = "#6ee7ff"; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
      ctx.fillStyle = "#06202a";
      ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(item.value, 0, 1);
    } else if (item.type === "gold") {
      ctx.fillStyle = "#ffd166";
      ctx.rotate(.5);
      ctx.fillRect(-6, -6, 12, 12);
    } else if (item.type === "weapon") {
      ctx.fillStyle = "#b68cff";
      ctx.shadowColor = "#b68cff"; ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(0, -13); ctx.lineTo(12, 0); ctx.lineTo(0, 13); ctx.lineTo(-12, 0);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = item.type === "potion" ? "#52e69a" : "#ff9f1c";
      ctx.fillRect(-6, -10, 12, 18);
      ctx.fillStyle = "#eafff7";
      ctx.fillRect(-3, -13, 6, 4);
    }
    ctx.restore();
  }

  function drawMonster(m) {
    if (!inView(m, 120)) return;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath(); ctx.ellipse(0, 10, m.radius * 1.15, m.radius * .55, 0, 0, TAU); ctx.fill();
    ctx.rotate(m.angle);
    ctx.shadowColor = m.rare ? "#ffd166" : "transparent";
    ctx.shadowBlur = m.rare ? 18 : 0;
    ctx.fillStyle = m.hitFlash > 0 ? "#ffffff" : m.color;
    ctx.beginPath();
    if (m.icon === "●") ctx.arc(0, 0, m.radius, 0, TAU);
    else if (m.icon === "◆") {
      ctx.moveTo(m.radius, 0); ctx.lineTo(0, m.radius); ctx.lineTo(-m.radius, 0); ctx.lineTo(0, -m.radius);
    } else if (m.icon === "▲") {
      ctx.moveTo(m.radius + 5, 0); ctx.lineTo(-m.radius, -m.radius); ctx.lineTo(-m.radius * .55, 0); ctx.lineTo(-m.radius, m.radius);
    } else {
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU, rr = i % 2 ? m.radius * .68 : m.radius;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#10201b";
    ctx.beginPath(); ctx.arc(m.radius * .35, -4, 2.8, 0, TAU); ctx.arc(m.radius * .35, 4, 2.8, 0, TAU); ctx.fill();
    ctx.restore();

    drawSmallBar(m.x, m.y - m.radius - 14, 38, 4, m.hp / m.maxHp, "#ff5a68");
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = m.rare ? "#ffd166" : "#d9fff0";
    ctx.fillText(`${m.rare ? "★ " : ""}Lv${m.tier + 1} ${m.name}`, m.x, m.y - m.radius - 19);
  }

  function drawPlayer(p) {
    if (!p.alive) return;
    if (!inView(p, 140)) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath(); ctx.ellipse(0, 12, 19, 10, 0, 0, TAU); ctx.fill();
    ctx.rotate(p.angle);
    const bodyColor = p.human ? "#6ee7ff" : "#ff6b7a";
    ctx.shadowColor = bodyColor;
    ctx.shadowBlur = p.hitFlash > 0 ? 18 : 8;
    ctx.fillStyle = p.hitFlash > 0 ? "#ffffff" : bodyColor;
    ctx.beginPath(); ctx.arc(0, 0, p.radius, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#081613";
    ctx.beginPath();
    ctx.moveTo(7, 0); ctx.lineTo(-8, -7); ctx.lineTo(-4, 0); ctx.lineTo(-8, 7);
    ctx.closePath(); ctx.fill();
    const weapon = currentWeapon(p);
    if (weapon) {
      ctx.strokeStyle = weapon.color;
      ctx.lineWidth = weapon.id === "hammer" ? 6 : 4;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(weapon.id === "blade" || weapon.id === "hammer" ? 27 : 22, weapon.id === "bow" ? -8 : 0);
      ctx.stroke();
    }
    ctx.restore();

    drawSmallBar(p.x, p.y - 28, 42, 5, p.hp / p.maxHp, p.human ? "#52e69a" : "#ff5a68");
    drawSmallBar(p.x, p.y - 35, 36, 3, clamp(p.time / INITIAL_TIME, 0, 1), "#6ee7ff");
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = p.human ? "#bdf6ff" : "#ffd5d9";
    ctx.fillText(p.human ? "你" : p.name, p.x, p.y - 42);
    p.pets.forEach(pet => drawPet(pet));
  }

  function drawPet(pet) {
    if (!inView(pet, 80)) return;
    ctx.save();
    ctx.translate(pet.x, pet.y);
    ctx.shadowColor = pet.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = pet.color;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + pet.angle;
      const rr = i % 2 ? 7 : 13;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawSmallBar(x, y, width, height, pct, color) {
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(x - width / 2 - 1, y - 1, width + 2, height + 2);
    ctx.fillStyle = color;
    ctx.fillRect(x - width / 2, y, width * clamp(pct, 0, 1), height);
  }

  function drawProjectile(p) {
    if (!inView(p, 60)) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(0, 0, p.radius, 0, TAU); ctx.fill();
    ctx.strokeStyle = p.color;
    ctx.globalAlpha = .35;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-p.vx * .035, -p.vy * .035);
    ctx.stroke();
    ctx.restore();
  }

  function drawEffect(e) {
    if (!inView(e, 220)) return;
    const t = 1 - e.life / e.maxLife;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.globalAlpha = 1 - t;
    if (e.type === "slash") {
      ctx.rotate(e.angle);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 7 * (1 - t);
      ctx.beginPath();
      ctx.arc(0, 0, e.range * (.45 + t * .75), -e.arc / 2, e.arc / 2);
      ctx.stroke();
    } else if (e.type === "nova" || e.type === "levelup" || e.type === "heal" || e.type === "chest") {
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 5 * (1 - t);
      ctx.beginPath(); ctx.arc(0, 0, e.range * t, 0, TAU); ctx.stroke();
    } else if (e.type === "explosion") {
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, e.range);
      g.addColorStop(0, "rgba(255,255,220,.9)");
      g.addColorStop(.45, "rgba(255,159,28,.65)");
      g.addColorStop(1, "rgba(255,90,64,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, e.range * (.35 + t * .75), 0, TAU); ctx.fill();
    } else if (e.type === "bomb") {
      ctx.fillStyle = "#ff9f1c";
      ctx.beginPath(); ctx.arc(0, 0, 8 + Math.sin(state.elapsed * 20) * 2, 0, TAU); ctx.fill();
    } else if (e.type === "dash") {
      ctx.rotate(e.angle);
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.ellipse(-18, 0, 30 * (1 - t), 10, 0, 0, TAU); ctx.fill();
    } else if (e.type === "death") {
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU, r = (e.radius || 18) * (t * 2.2);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * .4, Math.sin(a) * r * .4);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(0, 0, 10 * (1 - t), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawFloatingText(t) {
    if (!inView(t, 80)) return;
    ctx.save();
    ctx.globalAlpha = t.life / t.maxLife;
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = t.color;
    ctx.strokeStyle = "rgba(0,0,0,.65)";
    ctx.lineWidth = 3;
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillText(t.text, t.x, t.y);
    ctx.restore();
  }

  function drawScreenEdges() {
    if (!player.alive) return;
    const danger = player.time < 45 || player.outsideSafe;
    if (!danger) return;
    const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * .32, vw / 2, vh / 2, Math.max(vw, vh) * .72);
    g.addColorStop(0, "rgba(255,90,104,0)");
    g.addColorStop(1, "rgba(255,35,55,.28)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
  }

  function drawMinimap() {
    const s = mini.width / WORLD;
    mctx.clearRect(0, 0, mini.width, mini.height);
    const g = mctx.createRadialGradient(105, 105, 10, 105, 105, 105);
    g.addColorStop(0, "#473327");
    g.addColorStop(.55, "#245543");
    g.addColorStop(1, "#0b1c18");
    mctx.fillStyle = g;
    mctx.fillRect(0, 0, 210, 210);
    [280, 650, 1000, 1360].forEach(r => {
      mctx.strokeStyle = "rgba(255,255,255,.12)";
      mctx.beginPath(); mctx.arc(105, 105, r * s, 0, TAU); mctx.stroke();
    });
    mctx.strokeStyle = "rgba(110,231,255,.8)";
    mctx.lineWidth = 2;
    mctx.beginPath(); mctx.arc(105, 105, state.safeRadius * s, 0, TAU); mctx.stroke();
    mctx.fillStyle = "#fff2b8";
    mctx.beginPath(); mctx.arc(105, 105, 4, 0, TAU); mctx.fill();
    state.chests.forEach(c => {
      if (c.open) return;
      mctx.fillStyle = c.rare ? "#ffd166" : "#8cffcb";
      mctx.fillRect(c.x * s - 1.5, c.y * s - 1.5, 3, 3);
    });
    state.monsters.forEach(m => {
      if (m.tier < 2) return;
      mctx.fillStyle = m.rare ? "#ffd166" : "rgba(255,90,104,.8)";
      mctx.beginPath(); mctx.arc(m.x * s, m.y * s, m.rare ? 3 : 1.6, 0, TAU); mctx.fill();
    });
    state.players.forEach(p => {
      if (!p.alive) return;
      mctx.fillStyle = p.human ? "#6ee7ff" : "#ff5a68";
      mctx.beginPath(); mctx.arc(p.x * s, p.y * s, p.human ? 4 : 2.5, 0, TAU); mctx.fill();
    });
  }

  resize();
})();
