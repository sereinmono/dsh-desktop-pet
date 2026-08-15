/**
 * Plugin configuration.
 *
 * The entry `Config` schema is a Schemastery object (satisfying the Standard
 * Schema interface Cordis expects) so `cordis.yml` can provide overrides and
 * invalid values fail loudly at load time. The smaller {@link PetSettings}
 * schema is the user-editable subset registered as a settings namespace so the
 * Web configuration page can change it at runtime; the entry config fields
 * (`enabled`, `petScale`, `petId`) are that namespace's composition `base`.
 *
 * Position persistence lives in a private local file (not the harness config
 * service), so the pet works without any optional Harness storage service.
 */

import z from '@deepseek-ai/schemastery'

/** One entry in the runtime-scanned pet catalog. */
export interface PetCatalogEntry {
  /** Directory name under `assets/pets/<id>/` (also the pet id). */
  id: string
  /** Human label shown in the settings picker. */
  displayName: string
}

/** A one-shot action the client card requests and the host executes. */
export interface PetAction {
  kind: 'importFolder' | 'importPetdex'
  /** Correlation id so the host's result can be matched to the request. */
  requestId: string
  payload?: { slug?: string }
}

/** The outcome of a pet import, written back by the host. */
export interface PetImportResult {
  ok: boolean
  /** Machine-readable outcome code the client translates to UI copy. */
  code: string
  requestId: string
  petId?: string
  /** Optional human detail (e.g. a CLI stderr snippet) for diagnostics. */
  detail?: string
  at: number
}

/** Settings namespace name (spelled identically in the client package). */
export const DESKTOP_PET_SETTINGS_NS = 'desktop-pet'

/** User-editable settings section exposed on the Web configuration page. */
export interface PetSettings {
  /** Show or hide the pet. */
  enabled: boolean
  /** Integer scale multiplier applied to the 192×208 atlas cells. */
  petScale: number
  /** Which pet to display (a directory name under `assets/pets/`). */
  petId: string
  /** Hide the pet while no task is running; show it again on activity. */
  hideWhenIdle: boolean
  /**
   * The pets discovered under `assets/pets/` at startup. Read-only from the
   * client's perspective: the host always replaces it with its own scan, so a
   * user-layer value cannot shadow the directory facts.
   */
  availablePets: PetCatalogEntry[]
  /**
   * One-shot import request from the card. `null` (or absent) means no pending
   * request; the host clears it to `null` after acting so it never replays.
   */
  petAction?: PetAction | null
  /** Import outcome written back by the host; `null` (or absent) = none shown. */
  importResult?: PetImportResult | null
}

export const PetSettingsSchema: z<PetSettings> = z.object({
  enabled: z.boolean().default(true),
  petScale: z.number().step(0.25).min(0.5).max(4).default(1),
  petId: z.string().default('text'),
  hideWhenIdle: z.boolean().default(false),
  availablePets: z.array(z.object({
    id: z.string(),
    displayName: z.string(),
  })).default([]),
  petAction: z.object({
    kind: z.union(['importFolder', 'importPetdex']),
    requestId: z.string(),
    payload: z.object({ slug: z.string() }).default(undefined as never),
  }).default(null as never),
  importResult: z.object({
    ok: z.boolean(),
    code: z.string(),
    requestId: z.string(),
    petId: z.string().default(undefined as never),
    detail: z.string().default(undefined as never),
    at: z.number(),
  }).default(null as never),
})

export interface PetConfig {
  /** Composition-level master switch; when false the plugin loads but shows nothing. */
  enabled: boolean
  /** Keep the pet above other windows. */
  alwaysOnTop: boolean
  /** Integer scale multiplier applied to the 192×208 atlas cells. */
  petScale: number
  /** Which pet to display (a directory name under `assets/pets/`). */
  petId: string
  /** Hide the pet while no task is running; show it again on activity. */
  hideWhenIdle: boolean
  /** Run the frame animation. When false, a single static frame is shown. */
  animationEnabled: boolean
  /** Seconds (>=8) between randomized idle variations. */
  idleFrequencySec: number
  /** Pass pointer events through the window (Windows only). */
  clickThrough: boolean
  /** Start in the sleeping state. */
  startSleeping: boolean
  /** Global animation speed multiplier. */
  animationSpeed: number
}

export const Config: z<PetConfig> = z.object({
  enabled: z.boolean().default(true),
  alwaysOnTop: z.boolean().default(true),
  petScale: z.number().step(0.25).min(0.5).max(4).default(1),
  petId: z.string().default('text'),
  hideWhenIdle: z.boolean().default(false),
  animationEnabled: z.boolean().default(true),
  idleFrequencySec: z.natural().min(8).default(20),
  clickThrough: z.boolean().default(false),
  startSleeping: z.boolean().default(false),
  animationSpeed: z.number().min(0.25).max(4).default(1),
})

export const DEFAULT_CONFIG: PetConfig = {
  enabled: true,
  alwaysOnTop: true,
  petScale: 1,
  petId: 'text',
  hideWhenIdle: false,
  animationEnabled: true,
  idleFrequencySec: 20,
  clickThrough: false,
  startSleeping: false,
  animationSpeed: 1,
}
