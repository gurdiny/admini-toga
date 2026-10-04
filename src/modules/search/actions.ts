"use server";

import { z } from "zod";
import { defineAction } from "@/lib/action";
import { getSettings } from "@/lib/settings";
import { globalSearch } from "./queries";

const searchSchema = z.object({ q: z.string().trim().max(100) });

/** Búsqueda global. Solo lee; cualquiera que capture puede usarla. */
export const searchEverything = defineAction({ role: "STAFF", schema: searchSchema }, async ({ q }) =>
  globalSearch(q, (await getSettings()).modules),
);
