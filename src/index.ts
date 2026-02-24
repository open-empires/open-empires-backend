import { schema, table, t } from "spacetimedb/server";

const spacetimedb = schema({
  users: table(
    { name: "users", public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      createdAt: t.timestamp(),
      identity: t.identity().unique(),
      discordId: t.option(t.string()),
      prefersDarkMode: t.bool(),
      gridColor: t.string()
    },
  ),
  // TODO: user hotkeys preference
  // TODO: maybe have all users get a "mod" by default so they can customize things.
  // PERSISTENT WORLD
  mapInstances: table(
    { name: "map_instances", public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      createdAt: t.timestamp(),
      datasetId: t.u64().index(),
      width: t.u64(),
      height: t.u64(), // this is in increments. 32 increments per tile edge
    },
  ),
  terrainPlacements: table(
    { name: "terrain_placements", public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      mapInstanceId: t.u64().index(),
      x: t.u64(),
      y: t.u64(),
      terrainId: t.u64().index(),
      // TODO: right now we're using variants to model corner pieces, but this needs
      // to be generic in such a way that it can be encoded in the dataset
      terrainVariant: t.u8()
    }
  ),
  unitInstances: table(
    { name: "unit_instances", public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      createdAt: t.timestamp(),
      mapInstanceId: t.u64().index(),
      userId: t.u64().index(),
      unitId: t.u64().index(),
      x: t.u64(),
      y: t.u64(),
      facingDirection: t.enum("Direction", ["left", "leftUp", "up", "rightUp", "right", "rightDown", "down", "leftDown"]),
      // For units created by this unit
      gatherX: t.u64(),
      gatherY: t.u64()
    },
  ),
  unitProperties: table(
    {name: "unit_properties", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      unitId: t.u64().index(),
      unitPropertyMetadataId: t.u64().index(),
      // Controls max garrison, heal limit, max resources, etc.
      maxValue: t.u32(),
      value: t.u32()
    }
  ),
  projectile: table(
    {name: "projectile", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      createdAt: t.timestamp(),
      worldId: t.u64().index(),
      splashRadius: t.u32(),
      sourceCoordinateId: t.u64().index(),
      targetCoordinateId: t.u64().index(),
      plannedDuration: t.u32(),
      // for arcing arrows 
      plannedHeight: t.u32(),
      directionalSpritePathId: t.u64().index()
    }
  ),
  // Moving to locations, completing tasks.
  // Game engine is in charge of adding new movement nodes
  // For cases where unit needs to travel before task is possible.
  actionSequenceNodes: table(
    {name: "task_sequence_nodes", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      createdAt: t.timestamp(),
      worldId: t.u64().index(),
      unitId: t.u64().index(),
      priorActionSequenceNodeId: t.u64().index(),
      intendedActionMetadataId: t.u64().index(),
      fromX: t.u64(),
      fromY: t.u64(),
      
    }
  ),
  resourceInstances: table(
    {name: "resource_instances", public: true},
    {
      id: t.u64().index(),
      mapId: t.u64().index(),
      resourceId: t.u64().index(),
      userId: t.u64().index(),
      value: t.u32()
    }
  ),
  // TODO: active technologies
  // METADATA
  datasets: table(
    { name: "datasets", public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      createdAt: t.timestamp(),
      // From npm (important for sprite CDN access)
      packageName: t.string(),
      packageVersion: t.string(),
      // General icons
      populationIconSpritePath: t.string(),
      techTreeIconSpritePath: t.string(),
      chatIconSpritePath: t.string(),
      diplomacyIconSpritePath: t.string(),
      settingsIconSpritePath: t.string(),
      // Game interaction sprites
      standardCursorSpritePath: t.string(),
      goToLocationSpritePath: t.string(),
    },
  ),
  directionalSpritePath: table(
    {name: "directional_sprite_path", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      metadataSetId: t.u64().index(),
      leftSpritePath: t.string(),
      leftUpSpritePath: t.string(),
      upSpritePath: t.string(),
      rightUpSpritePath: t.string(),
      rightSpritePath: t.string(),
      rightDownSpritePath: t.string(),
      downSpritePath: t.string(),
      leftDownSpritePath: t.string()
    }
  ),
  unitCategory: table(
    {name: "unit_category", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      metadataSetId: t.u64().index(),
      name: t.string()
    }
  ),
  unitPropertyMetadata: table(
    {name: "unit_property_metadata", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      metadataSetId: t.u64().index(),
      name: t.string(),
    }
  ),
  terrain: table(
    {name: "terrain", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      metadataSetId: t.u64().index(),
      spritePath: t.string(),
      name: t.string()
    }
  ),
  terrainWalkableUnitCategories: table(
    {name: "terrain_walkable_unit_categories", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      metadataSetId: t.u64().index(),
      terrainId: t.u64().index(),
      unitCategoryId: t.u64().index(),
    }
  ),
  resources: table(
    { name: "resources", public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      name: t.string(),
      iconSpritePath: t.string()
    }
  ),
  units: table(
    { name: "units", public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      unitCategoryId: t.u64().index(),
      iconSpritePath: t.string(),
      length: t.u64(),
      height: t.u64(),
      name: t.string(),
      selectSoundPath: t.string(),
      selectable: t.bool(),
      deathByUnitPropertyId: t.u64().index(),
      walkable: t.bool(),
      // Arrows and bullets cannot be obstructed
      blockable: t.bool(),
      // For perpetually hovering things like birds or planes or arcing projectiles
      hoverHeight: t.u64(),
      ascentAcceleration: t.u64(),
      descentAcceleration: t.u64(),
      ascentStartSpeed: t.u64(),
      descentStartSpeed: t.u64(),
      // Most things "die" by hitting 0, except foundations which die at hp capacity
      deathByZero: t.bool(),
      tiled: t.bool(),
    },
  ),
  unitDeathProgressions: table(
    { name: "unit_death_progressions", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      sourceAction: t.u64().index(),
      // Example 1: Hunt action causes boar to become downed boar whereas normal attack 
      //            causes boar to directly become carcass.
      // Example 2: Chop action causes tree to become downed tree whereas onager shot
      //            cases tree to directly become stump.
      replaceWithUnitId: t.u64().index(),
    }
  ),
  baseUnitProperties: table(
    { name: "base_unit_properties", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      unitId: t.u64().index(),
      unitPropertyId: t.u64().index(),
      value: t.u32()
    }
  ),
  actions: table(
    { name: "actions", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      sourceUnitId: t.u64().index(),
      targetUnitCategories: t.array(t.u64()),
      taskSoundPath: t.string(),
      activeSoundPath: t.string(),
      cursorSpritePath: t.string(),
      // Garrisons and conversions are not repeatable for example
      repeats: t.bool(),
      // Used for conversions taking some amount of time or arrows missing
      missChance: t.u32().index(),
      speedUnitPropertyId: t.u64().index(),
      minimumRangeUnitPropertyId: t.u64().index(),
      maximumRangeUnitPropertyId: t.u64().index(),
      // Conversions and charge take time before they can be repeated
      rechargeTime: t.u32(),
      name: t.string(),
    }
  ),
  actionEffects: table(
    {name: "action_effects", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      actionId: t.u64().index(),
      splashRadius: t.u64(),
      friendlyFire: t.bool(),
      impactsOthers: t.bool(),
      sourceGarrisons: t.bool(),
      targetGarrisons: t.bool(),
      sourceUngarrisons: t.bool(),
      targetUngarrisons: t.bool(),
      sourceUnitPropertyId: t.u64().index(),
      targetUnitPropertyId: t.u64().index(),
      targetUnitPropertyDirection: t.enum("Direction", ["up", "down"]),
      targetDefensePropertyId: t.u64().index(),
      targetConverts: t.bool(),
      spawnProjectileUnitId: t.u64().index(),
    }
  ),
  actionSprites: table(
    {name: "action_sprites", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      actionId: t.u64().index(),
      unitPropertyId: t.u64().index(),
      unitPropertyValueBelowOrEq: t.option(t.u32()),
      unitPropertyValueAboveOrEq: t.option(t.u32()),
      directionalSpritePathId: t.u64().index()
    }
  )
});

export default spacetimedb;
const AUTO_INC_ID = 0n;

export const init = spacetimedb.init({ name: "init" }, (_ctx) => {
  // Called when the module is initially published
});

export const onConnect = spacetimedb.clientConnected({ name: "on_connect" }, (ctx) => {
  const existingPlayer = ctx.db.user.identity.find(ctx.sender);
  if (existingPlayer) {
    return;
  }
  const user = ctx.db.user.insert({
    id: AUTO_INC_ID,
    identity: ctx.sender,
    discordId: undefined,
    createdAt: ctx.timestamp,
  });
  // For now everyone is placed into the same map
  const world = ctx.db.world.id.find(1n);
  if (!world) {
    return;
  }

  let militiaMetadata: ReturnType<typeof ctx.db.unitMetadata.insert> | undefined;
  for (const metadata of ctx.db.unitMetadata.iter()) {
    if (metadata.metadataSetId === world.metadataSetId && metadata.name.toLowerCase() === "militia") {
      militiaMetadata = metadata;
      break;
    }
  }
  if (!militiaMetadata) {
    return;
  }

  const walkableTerrainIds = new Set<bigint>();
  for (const walkable of ctx.db.terrainWalkableUnitCategories.iter()) {
    if (
      walkable.metadataSetId === world.metadataSetId
      && walkable.unitCategoryId === militiaMetadata.unitCategoryId
    ) {
      walkableTerrainIds.add(walkable.terrainId);
    }
  }
  if (walkableTerrainIds.size === 0) {
    return;
  }

  const occupiedTiles = new Set<string>();
  for (const unit of ctx.db.unit.iter()) {
    if (unit.worldId === world.id) {
      occupiedTiles.add(`${unit.tileX},${unit.tileY}`);
    }
  }

  let chosenTileX = 0;
  let chosenTileY = 0;
  let candidateCount = 0;
  for (const placement of ctx.db.terrainPlacement.iter()) {
    if (placement.worldId !== world.id || !walkableTerrainIds.has(placement.terrainId)) {
      continue;
    }

    if (occupiedTiles.has(`${placement.tileX},${placement.tileY}`)) {
      continue;
    }

    candidateCount += 1;
    if (Math.floor(Math.random() * candidateCount) === 0) {
      chosenTileX = placement.tileX;
      chosenTileY = placement.tileY;
    }
  }

  if (candidateCount === 0) {
    return;
  }

  ctx.db.unit.insert({
    id: AUTO_INC_ID,
    createdAt: ctx.timestamp,
    worldId: world.id,
    userId: user.id,
    unitMetadataId: militiaMetadata.id,
    tileX: chosenTileX,
    tileY: chosenTileY,
    offsetX: 0,
    offsetY: 0,
    currentHp: militiaMetadata.hp,
    currentAction: "idle",
    facingDirection: {tag: "down"},
    trainPercent: 100,
    trainedByUnit: 0n,
    gatherPointTileX: chosenTileX,
    gatherPointTileY: chosenTileY,
  });
});

export const onDisconnect = spacetimedb.clientDisconnected({ name: "on_disconnect" }, (_ctx) => {
  // Called every time a client disconnects
});

export const add = spacetimedb.reducer({ name: "add" }, { name: t.string() }, (ctx, { name }) => {
  const player = upsertPlayerDisplayName(ctx, name);
  const dataset = ensureDefaultDataset(ctx);
  const map = ensureDefaultMap(ctx, dataset.id);
  const unitMetadata = ensureDefaultUnitMetadata(ctx, dataset.id);
  ensureDefaultActionSprites(ctx, unitMetadata.id);
  ensurePlayerHasStarterUnit(ctx, map.id, player.id, unitMetadata.id);
});

export const sayHello = spacetimedb.reducer({ name: "say_hello" }, (ctx) => {
  const player = ctx.db.player.identity.find(ctx.sender);
  const playerLabel = player?.displayName || "anonymous commander";
  console.info(`Hello, ${playerLabel}!`);
  console.info(
    `Maps=${countRows(ctx.db.map.iter())} Players=${countRows(ctx.db.player.iter())} Units=${countRows(ctx.db.unit.iter())}`,
  );
});

function upsertPlayerDisplayName(ctx: Parameters<typeof add>[0], displayName: string) {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (!existing) {
    return ctx.db.player.insert({
      id: AUTO_INC_ID,
      identity: ctx.sender,
      displayName,
      createdAt: ctx.timestamp,
    });
  }

  return ctx.db.player.id.update({
    ...existing,
    displayName,
  });
}

function ensureDefaultDataset(ctx: Parameters<typeof add>[0]) {
  const existing = ctx.db.dataset.name.find("default");
  if (existing) {
    return existing;
  }

  return ctx.db.dataset.insert({
    id: AUTO_INC_ID,
    name: "default",
    createdAt: ctx.timestamp,
  });
}

function ensureDefaultMap(ctx: Parameters<typeof add>[0], datasetId: bigint) {
  const existing = ctx.db.map.name.find("arena");
  if (existing) {
    return existing;
  }

  return ctx.db.map.insert({
    id: AUTO_INC_ID,
    datasetId,
    name: "arena",
    width: 128,
    height: 128,
    createdAt: ctx.timestamp,
  });
}

function ensureDefaultUnitMetadata(ctx: Parameters<typeof add>[0], datasetId: bigint) {
  const existing = ctx.db.unitMetadata.code.find("militia");
  if (existing) {
    return existing;
  }

  return ctx.db.unitMetadata.insert({
    id: AUTO_INC_ID,
    datasetId,
    code: "militia",
    name: "Militia",
    attack: 4,
    movementSpeed: 1.1,
    attackSpeed: 1.6,
    startingHp: 40,
    meleeArmor: 0,
    pierceArmor: 0,
    possibleActions: ["idle", "walk", "attack", "die"],
  });
}

function ensureDefaultActionSprites(ctx: Parameters<typeof add>[0], unitMetadataId: bigint): void {
  const directions = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
  const actions = ["idle", "walk", "attack", "die"];
  for (const action of actions) {
    for (const direction of directions) {
      const alreadyExists = hasActionSprite(ctx, unitMetadataId, action, direction);
      if (alreadyExists) {
        continue;
      }

      ctx.db.unitMetadataActionSprite.insert({
        id: AUTO_INC_ID,
        unitMetadataId,
        action,
        direction,
        spriteKey: `militia/${action}/${direction}`,
      });
    }
  }
}

function ensurePlayerHasStarterUnit(
  ctx: Parameters<typeof add>[0],
  mapId: bigint,
  ownerPlayerId: bigint,
  unitMetadataId: bigint,
): void {
  for (const unit of ctx.db.unit.iter()) {
    if (unit.mapId === mapId && unit.ownerPlayerId === ownerPlayerId) {
      return;
    }
  }

  ctx.db.unit.insert({
    id: AUTO_INC_ID,
    mapId,
    ownerPlayerId,
    unitMetadataId,
    positionX: 64,
    positionY: 64,
    currentHp: 40,
    currentAction: "idle",
    facingDirection: "s",
  });
}

function hasActionSprite(
  ctx: Parameters<typeof add>[0],
  unitMetadataId: bigint,
  action: string,
  direction: string,
): boolean {
  for (const sprite of ctx.db.unitMetadataActionSprite.iter()) {
    if (sprite.unitMetadataId === unitMetadataId && sprite.action === action && sprite.direction === direction) {
      return true;
    }
  }
  return false;
}

function countRows<T>(iter: Iterable<T>): number {
  let count = 0;
  for (const _ of iter) {
    count += 1;
  }
  return count;
}
