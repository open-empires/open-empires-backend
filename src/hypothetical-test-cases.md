Aiming to ensure our unit / map / action / effect system can
handle all these cases just through dataset encodings.

I may want to look at trigger system in aoe2 for inspiration

## Interesting Notes

We model actions as something one unit does to another, modifying
a stat of a target unit via some stat from the source unit. The action ceases when any stats being modified hit their limit. Surprisingly, this base primitive covers most cases.
- Monk healing means unit hp increases at monk's heal rate. Healing stops when unit's hp reaches full
- Building creating unit means unit's train % increases at building's create unit rate. unit spawned when unit's train % is full
- Attacking is decreasing one unit's hp by source unit's attack at the attack speed. target dies when hp is 0.

## Covered Cases
- villager chops down tree
  - villager does "chop" action against tree which decreases its hp
  - tree dies on hp = 0, replaced with downed tree since it was from 
    the chop action
  - villager immediately transitions to "gather wood" action against 
    downed tree which decreases wood. downed tree dies once wood is 0 and is replaced with 
- onager flattens tree
- villager gathers gold
- villager walks with meat
- villager shoots boar: becomes meat
- castle shoot boar: becomes carcass
- villager drops off food from farm at mill
- villager tasked to new resource loses all other resources
- monk converts knight
- monk recharges convert
- monk picks up relic
- monk drops relic
- passive garrisoned relic: produces gold
- passive downed boar: loses meat
- passive feitoria: gains resources
- passive garrisoned unit: heals
- passive unit training progresses

## Not Covered Cases
- technologies (in general it'll just multiply unit properties)
- when villager is attacked, run away but then eventually go back to what they were doing
- monk on transport ship with relic. relic goes to last land location on ship down
- formations
- auto intentions
  - auto aggro
  - villager decides where to drop off
  - patrolling
  - monk auto healing the next damaged unit
  - villager starts gathering from tree after it's downed
  - building moves on to next queue item after current unit done training or tech done researching