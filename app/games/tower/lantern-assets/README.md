# Lantern asset drop-in

Put Lantern-owned (or clearly commercial / CC0) files here using the **same filename** as the donor engine slot.

Then run:

```
node app/games/tower/apply-asset-overlay.mjs
```

The script copies this directory over `app/games/tower/assets/` for every slot whose `runtime` is `lantern` or whose file exists here. Donor binaries under `donor/assets/` stay as the provenance snapshot and are not rewritten.

Do not drop BMQB / 贝米钱包 logos, Caketown, or other uncleared donor media into this folder.

Slot list: [`../asset-slots.json`](../asset-slots.json).
