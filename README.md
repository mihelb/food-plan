# FoodPlan

A Linux desktop meal planner for runners. Build recipes from a free nutrition database, drag them into a
weekly calendar, and see at a glance whether you're hitting your macros each day and your vitamins and
minerals over the week.

## Features

- **Recipes** built from real food data. Nutrients per serving are calculated automatically, and household
  portions (cup, slice, medium banana…) come straight from USDA.
- **Free food databases**
  - [USDA FoodData Central](https://fdc.nal.usda.gov): public domain, with full micronutrient profiles
    (Foundation, SR Legacy and Survey foods, plus branded foods if you want them).
  - [Open Food Facts](https://world.openfoodfacts.org): packaged products, searchable by name or barcode.
    Micronutrients are often missing for these, and the app flags when that happens.
  - Custom foods, entered from a nutrition label.
  - Imported foods are stored locally, so recipes and plans keep working offline.
- **Weekly calendar**: rows for Breakfast, Snack (AM), Lunch, Snack (PM), Dinner, Snack (evening) and
  Supplements. Drag recipes or supplements from the sidebar into a slot. Drag a planned item to move it,
  or hold Ctrl while dragging to copy it. "⇉ all week" repeats an item on every day, and
  "Copy previous week" reuses last week's plan.
- **Energy targets**: daily target = baseline/BMR (set in Profile) + the active kcal from your watch,
  which you type into each day's header. "Refuel mode" (on by default) uses the *previous* day's watch
  kcal for today's target.
- **Automatic portion scaling**: switch on **⚖ auto** on one or more meals in a day. Their quantities
  are scaled by a common factor (between 0.25× and 4×) so the day lands exactly on its kcal target.
  Click a meal to see the scaled gram amounts to prepare.
- **Daily macro chart**: energy, carbs, protein, fat and fiber against targets for the selected day.
  Protein is set in g/kg and fat as a % of kcal; carbs fill the remaining energy, so they rise with
  training load.
- **Weekly micronutrient chart**: 24 vitamins and minerals plus omega-3, each shown as a weekly total
  against 7 × the daily reference intake, with the amount still missing. You get a warning when your
  daily average goes over the tolerable upper limit (useful for supplements like iron or vitamin D).
- **Supplements** with per-dose nutrients. They count towards the charts.
- Defaults are the US National Academies RDA/AI values for your sex and age, and you can override any
  micronutrient target.
- Light / dark / auto (follow desktop) theme switch in the top bar.
- JSON export/import for backups.

## Install / run

Requires Node.js 20+.

```bash
npm install
npm start            # build the UI and launch the desktop app
```

Build Linux packages (AppImage + .deb) into `release/`:

```bash
npm run dist
./release/FoodPlan-0.1.0.AppImage
# or: sudo apt install ./release/food-plan_0.1.0_amd64.deb
```

Development with hot reload:

```bash
npm run dev             # terminal 1: Vite dev server
npm run dev:electron    # terminal 2: Electron pointing at it
npm test                # unit tests (nutrient parsing, targets, auto-scaling)
```

## First steps

1. **Profile & targets**: enter your weight, sex, age and BMR (or estimate it from your height). Get a
   free USDA API key at <https://fdc.nal.usda.gov/api-key-signup> and paste it in. The built-in
   `DEMO_KEY` only allows a few searches per hour.
2. **Recipes → New recipe → Add ingredient**: search USDA (e.g. "oats rolled", "salmon atlantic
   cooked") and pick results with a high "micros %" badge.
3. **Supplements**: add what you take, using the amounts from the label.
4. **Week plan**: drag recipes into slots, enter each day's active kcal from your watch, and mark one
   meal per day as **⚖ auto** so it fills the gap.

Your data lives in `~/.config/FoodPlan/foodplan.json`.

## Notes

- Nutrient values from the databases are per 100 g. Missing values count as 0, and the week view lists
  foods whose micronutrient data is incomplete, so your real intake may be higher than shown.
- Reference intakes are for healthy adults. Endurance athletes may need more of some nutrients (iron,
  sodium, carbohydrates), so adjust the targets with your doctor or a sports dietitian.
