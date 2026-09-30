/** Pet placement and presentation preferences, persisted app-wide. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** The three floating forms the window takes. */
export type SpeedPetForm = 'pet' | 'gauge' | 'capsule'

/** Persisted pet state. Placement stores insets from the viewport's bottom-right. */
export interface SpeedPetState {
  /** Right inset in px. */
  right: number
  /** Bottom inset in px. */
  bottom: number
  form: SpeedPetForm
  /** Whether the pet hides itself while nothing is generating. */
  hideWhenIdle: boolean
  /** Sprite pack of the pet form; empty uses the first shipped pack. */
  packId: string
  /** Whether the pet's bubble stays expanded over its live reading without hover. */
  alwaysLast: boolean
}

/** Declared write set for the pet entry. */
export type SpeedPetActions = {
  moveTo: (draft: SpeedPetState, right: number, bottom: number) => void
  setForm: (draft: SpeedPetState, form: SpeedPetForm) => void
  toggleHideWhenIdle: (draft: SpeedPetState) => void
  setPack: (draft: SpeedPetState, packId: string) => void
  toggleAlwaysLast: (draft: SpeedPetState) => void
}

const STORE_KEY = 'dsh.speed-pet'

/**
 * Declare the pet placement store.
 * @returns the store handle.
 */
export function createSpeedPetStore(): EngineStoreHandle<SpeedPetState, SpeedPetActions> {
  return defineStore({
    init: (): SpeedPetState => ({
      right: 32,
      bottom: 96,
      form: 'pet',
      hideWhenIdle: false,
      packId: '',
      alwaysLast: true,
    }),
    persist: STORE_KEY,
    actions: {
      moveTo: (d, right: number, bottom: number) => {
        d.right = right
        d.bottom = bottom
      },
      setForm: (d, form: SpeedPetForm) => { d.form = form },
      toggleHideWhenIdle: (d) => { d.hideWhenIdle = !d.hideWhenIdle },
      setPack: (d, packId: string) => { d.packId = packId },
      toggleAlwaysLast: (d) => { d.alwaysLast = !d.alwaysLast },
    },
  })
}
