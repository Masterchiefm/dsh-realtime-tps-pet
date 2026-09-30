/**
 * The plugin's own Settings page: every preference the right-click menu
 * crams into a narrow list, laid out as full-width rows 鈥?form, average
 * metric, pet pack, window size, and the two behavior toggles. The page
 * reads and writes the same persisted store the floating window uses, so
 * both stay in step live.
 */
import type { ChangeEvent } from 'react'
import { SegmentedControl, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { NS } from './locales.ts'
import { PET_PACKS } from './pets.ts'
import { MAX_SCALE, MIN_SCALE, type createSpeedPetStore, type SpeedPetForm, type SpeedPetMetric } from './store.ts'
import css from './SpeedPetSettings.module.css'

/** Full props for the settings-page entry. */
export type SpeedPetSettingsProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<typeof NS>
  & PropsStore<ReturnType<typeof createSpeedPetStore>>

/**
 * Render the speed-pet settings page.
 * @param props - the shared placement store and the namespace translator.
 * @returns the page element tree.
 */
export function SpeedPetSettings({ useStore, actions, t }: SpeedPetSettingsProps) {
  const form = useStore(state => state.form)
  const metric = useStore(state => state.metric ?? 'session')
  const packId = useStore(state => state.packId)
  const scale = useStore(state => state.scale ?? 1)
  const alwaysLast = useStore(state => state.alwaysLast)
  const hideWhenIdle = useStore(state => state.hideWhenIdle)

  const onScale = (event: ChangeEvent<HTMLInputElement>): void => {
    actions.setScale(Number(event.target.value))
  }

  return (
    <div className={css.page}>
      <div className={css.row}>
        <span className={css.rowLabel}>{t('settings.form.label')}</span>
        <SegmentedControl
          id="speed-pet-form"
          value={form}
          label={t('settings.form.label')}
          options={[
            { value: 'pet', label: t('menu.form.pet') },
            { value: 'gauge', label: t('menu.form.gauge') },
            { value: 'capsule', label: t('menu.form.capsule') },
          ]}
          onChange={(next: SpeedPetForm) => { actions.setForm(next) }}
        />
      </div>
      <div className={css.row}>
        <span className={css.rowLabel}>{t('settings.metric.label')}</span>
        <SegmentedControl
          id="speed-pet-metric"
          value={metric}
          label={t('settings.metric.label')}
          options={[
            { value: 'round', label: t('menu.metric.round') },
            { value: 'step', label: t('menu.metric.step') },
            { value: 'session', label: t('menu.metric.session') },
          ]}
          onChange={(next: SpeedPetMetric) => { actions.setMetric(next) }}
        />
      </div>
      <div className={css.row}>
        <span className={css.rowLabel}>{t('settings.pack.label')}</span>
        <SegmentedControl
          id="speed-pet-pack"
          value={packId === '' ? PET_PACKS[0]!.id : packId}
          label={t('settings.pack.label')}
          options={PET_PACKS.map(pack => ({ value: pack.id, label: pack.displayName }))}
          onChange={(next: string) => { actions.setPack(next) }}
        />
      </div>
      <div className={css.row}>
        <label className={css.rowLabel} htmlFor="speed-pet-scale">{t('settings.scale.label')}</label>
        <span className={css.scaleControl}>
          <input
            id="speed-pet-scale"
            type="range"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={0.02}
            value={scale}
            onChange={onScale}
            aria-label={t('settings.scale.label')}
          />
          <span className={css.scaleValue}>{Math.round(scale * 100)}%</span>
        </span>
      </div>
      <p className={css.hint}>{t('settings.scale.hint')}</p>
      <div className={css.row}>
        <span className={css.rowLabel}>{t('menu.alwaysLast')}</span>
        <Switch
          checked={alwaysLast}
          label={t('menu.alwaysLast')}
          onChange={() => { actions.toggleAlwaysLast() }}
        />
      </div>
      <div className={css.row}>
        <span className={css.rowLabel}>{t('menu.hideIdle')}</span>
        <Switch
          checked={hideWhenIdle}
          label={t('menu.hideIdle')}
          onChange={() => { actions.toggleHideWhenIdle() }}
        />
      </div>
    </div>
  )
}
