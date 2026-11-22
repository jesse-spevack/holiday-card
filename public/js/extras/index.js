// The hidden extras, one module each. To add an extra, write its module in this folder and add it to this list.
// The recipe is "Add a hidden extra" in AGENTS.md, and the shape of an extra is at the top of public/js/registry.js.
//
// The order of the list matters:
//   - It is the draw order of the layers. The lamp's night tint covers the layers before the fire, plants, and pets.
//     The pets come last, so a pet's heart or flame shows over everything.
//   - The extras make their random choices in this order (the first Waymo and Cybertruck, then the dreidel's snow).
//   - Where two tap areas are the same distance from a tap, the one earlier in the list wins.

import album from "./album.js";
import lamp from "./lamp.js";
import waymo from "./waymo.js";
import cybertruck from "./cybertruck.js";
import star from "./star.js";
import menorah from "./menorah.js";
import toast from "./toast.js";
import plants from "./plants.js";
import fire from "./fire.js";
import presents from "./presents.js";
import dreidel from "./dreidel.js";
import pets from "./pets.js";
import silly from "./silly.js";

export const EXTRAS = [album, lamp, waymo, cybertruck, star, menorah, toast, plants, fire, presents, dreidel, pets, silly];
