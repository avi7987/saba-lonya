import type { Person } from "./types";

/*
  The family tree starts with only Lonya and his wife. Everyone else is added through the site
  ("Add to the tree") and the tree grows a row per generation. Lonya's parents are referenced by
  fixed ids so his brothers and sisters can be linked to them even before the parents themselves
  are added. (ROOT is the person the whole site is about; PARTNER is the space for his wife.)
*/
export const ROOT = "lonya";
export const PARTNER = "partner";
export const MOTHER = "p-mother";
export const FATHER = "p-father";

export const family: Person[] = [
  { id: ROOT, name: "לוניה", nameAlt: "Лёня", gender: "m", photoSrc: "/images/avatar.webp", parents: [MOTHER, FATHER], partnerId: PARTNER },
  { id: PARTNER, name: "", gender: "f", partnerId: ROOT, placeholder: true },
];
