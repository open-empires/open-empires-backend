import { schema, table, t } from "spacetimedb/server";

const spacetimedb = schema({
  users: table(
    { name: "users", public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      createdAt: t.timestamp(),
      identity: t.identity().unique(),
      discordId: t.option(t.string()),
      // TODO: preferences including hotkeys
      prefersDarkMode: t.bool(),
      gridColor: t.string()
    },
  ),
  // TODO: maybe have all users get a "mod" by default so they can customize things.
  // PERSISTENT WORLD
  mapInstances: table(
    { name: "map_instances", public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      createdAt: t.timestamp(),
      datasetId: t.u64().index(),
      // Long-term the goal is to get this to 500
      empireLimit: t.u32(),
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
      // to be generic in such a way that it can be encoded in the dataset so the map
      // can be generated procedurally
      terrainVariant: t.u8()
    }
  ),
  empires: table(
    { name: "empires", public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      mapInstanceId: t.u64().index(),
      name: t.string(),
      civilization: t.u64().index(),
      // An empire's stockpile is actually a unit.
      // The unit has resource stats and perhaps handicap multipliers.
      stockpileUnitInstanceId: t.u64().index()
    }
  ),
  // co-op support by making user to empire many to many
  players: table(
    { name: "players", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      empireId: t.u64().index(),
      userId: t.u64().index()
    }
  ),
  unitInstances: table(
    { name: "unit_instances", public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      createdAt: t.timestamp(),
      mapInstanceId: t.u64().index(),
      empireId: t.u64().index(),
      unitId: t.u64().index(),
      x: t.u64(),
      y: t.u64(),
      facingDirection: t.enum("Direction", ["left", "leftUp", "up", "rightUp", "right", "rightDown", "down", "leftDown"]),
      // For units created by this unit
      gatherX: t.u64(),
      gatherY: t.u64()
    },
  ),
  unitPropertyInstances: table(
    { name: "unit_property_instances", public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      unitInstanceId: t.u64().index(),
      unitPropertyId: t.u64().index(),
      // Controls max garrison, heal limit, max resources, etc.
      maxValue: t.u32(),
      value: t.u32()
    }
  ),
  // Moving to locations, completing tasks.
  // Game engine is in charge of adding new movement nodes
  // For cases where unit needs to travel before task is possible.
  actionSequenceNodes: table(
    {name: "action_sequence_nodes", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      createdAt: t.timestamp(),
      mapInstanceId: t.u64().index(),
      unitInstanceId: t.u64().index(),
      // When 0, it's the current action
      priorActionSequenceNodeId: t.u64().index(),
      actionId: t.u64().index(),
      fromX: t.u64(),
      fromY: t.u64(),
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
      techTreeIconSpritePath: t.string(),
      chatIconSpritePath: t.string(),
      diplomacyIconSpritePath: t.string(),
      settingsIconSpritePath: t.string(),
      // Game interaction sprites
      standardCursorSpritePath: t.string(),
      goToLocationSpritePath: t.string(),
    },
  ),
  directionalSpritePaths: table(
    {name: "directional_sprite_paths", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
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
  unitCategories: table(
    {name: "unit_categories", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      metadataSetId: t.u64().index(),
      name: t.string()
    }
  ),
  unitProperties: table(
    {name: "unit_properties", public: true},
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
  const existingPlayer = ctx.db.users.identity.find(ctx.sender);
  if (existingPlayer) {
    return;
  }
  const user = ctx.db.users.insert({
    id: AUTO_INC_ID,
    identity: ctx.sender,
    discordId: undefined,
    createdAt: ctx.timestamp,
    // TODO: get from context
    prefersDarkMode: true,
    gridColor: "#000000"
  });
  // For now everyone is placed into the same map
  const mapInstance = ctx.db.mapInstances.id.find(1n);
  if (!mapInstance) {
    // TODO: some kind of error needs to be returned to the end user
    return;
  }

  // TODO create a villager. Create a stockpile.
  // Only create an empire if 

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

export const ingestDataset = spacetimedb.reducer({ name: "add" }, { name: t.string() }, (ctx, { name }) => {
  
});

export const createEmpire = spacetimedb.reducer({name: "create_empire"}, {name: t.string(), mapInstanceId: t.u64() }, (ctx, {name}) => {
  // TODO: create empire with current user only if it's below the empire limit.
  //       we'll spawn a villager and a scout cavalry
});

export const enqueueAction = spacetimedb.reducer({name: "enqueue_action"}, {actionId: t.u64(), sourceUnitId: t.u64(), targetUnitId: t.u64(), clearActionBacklog: t.bool()}, (ctx, props) => {
  
});

// TODO: should be a scheduled reducer
export const tick = spacetimedb.reducer({name: "tick"})