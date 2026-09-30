/**
 * Speed-pet plugin, browser half: folds Assistant streaming into a `speed-pet`
 * view target and floats the pet over the shell overlay following the
 * main-view Session. The pet reads the followed session's snapshot through the
 * entry's registrant-private hooks compartment; no cross-plugin seat exists.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { SpeedPet } from './SpeedPet.tsx'
import type { SpeedPetInjected } from './SpeedPet.tsx'
import { SpeedPetSettings } from './SpeedPetSettings.tsx'
import type { SpeedPetSettingsInjected } from './SpeedPetSettings.tsx'
import { speedPetViewDefinition } from './speed-view.ts'
import { speedStepDefinition } from './speed-definition.ts'
import { createSpeedSource } from './speed-source.ts'
import { createSpeedPetStore } from './store.ts'
import { createUpdateCheck } from './use-update.ts'
import { en, NS, zh, type SpeedPetKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Speed-pet copy. */
    'speedPet': SpeedPetKey
  }
}

/** Required services: the Conversation registries, the Session object layer, slots, and dictionaries. */
export const inject = ['uiConversation', 'sessions', 'slots', 'locale']

/**
 * Client plugin body: register the dictionaries, the Step fold, the view
 * target, the followed main-view speed source, and the overlay entry.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'speed-pet: dictionaries')
  ctx.effect(() => {
    const disposeEvents = ctx.uiConversation.events.register(speedStepDefinition)
    const disposeView = ctx.uiConversation.views.register(speedPetViewDefinition)
    return () => {
      disposeView()
      disposeEvents()
    }
  }, 'speed-pet: conversation fold')
  const speed = createSpeedSource(ctx)
  ctx.effect(() => () => { speed.dispose() }, 'speed-pet: speed source')
  // One handle for every seat: the framework caches one store instance per
  // handle x scope key, so the floating window and the settings page share
  // the same persisted state and stay in step live.
  const store = createSpeedPetStore()
  const t = ctx.locale.bind(NS)
  // One shared update-check seat: the floating window probes GitHub on mount,
  // the settings page re-checks on demand, both read the same status.
  const updateCheck = createUpdateCheck()
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'speed-pet',
    // The pet floats above the toast entries and keeps to itself.
    order: 10,
    locale: NS,
    store,
    inject: (): SpeedPetInjected => ({ hooks: { speed: speed.observable }, update: updateCheck }),
  }, SpeedPet))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'speed-pet',
    order: 40,
    label: () => t('settings.nav'),
    locale: NS,
    store,
    inject: (): SpeedPetSettingsInjected => ({ update: updateCheck }),
  }, SpeedPetSettings))
}
