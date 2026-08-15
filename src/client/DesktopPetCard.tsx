/**
 * The desktop pet card: a header naming the plugin and what its settings
 * govern, disclosing controls in place, with the save that writes them.
 *
 * This replicates the plugin-configuration card chrome (see
 * ui-settings-plugins' PluginCard) so the pet card reads identically to the
 * Shell and Agent-loop cards: name-over-description header with a chevron, a
 * footer with Discard/Save, and one labelled field row per control. Staged
 * edits outlive collapsing, and the header marks a card holding unsaved edits.
 */

import { useState } from 'react'
import clsx from 'clsx'
import { IconChevronDownOutline14, IconFolderOpen16, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopPetCardFace, ImportMessage } from './desktop-pet-controller'
import { PET_SCALE_MAX, PET_SCALE_MIN, PET_SCALE_STEP, quantizeScale } from './desktop-pet-controller'
import type { DesktopPetKey } from './locales'
import css from './DesktopPetCard.module.css'

/** Props the renderer binds for the desktop pet card. */
export type DesktopPetCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.desktopPet'>
  & InjectFace<DesktopPetCardFace>

/** GitHub repository path to the "adding a pet" guide. */
const ADD_PET_DOC_URL = 'https://github.com/sereinmono/dsh-desktop-pet/blob/master/docs/adding-a-pet.md'

/** Import outcome code → localized copy key (unknown codes fall back to generic). */
const IMPORT_COPY: Record<string, DesktopPetKey> = {
  'ok': 'desktopPet.importOk',
  'already-present': 'desktopPet.importAlreadyPresent',
  'duplicate-id': 'desktopPet.importConflict',
  'no-folder-picker': 'desktopPet.importNoFolderPicker',
  'petdex-not-found': 'desktopPet.importPetdexNotFound',
  'petdex-failed': 'desktopPet.importPetdexFailed',
}

/** The Petdex brand mark: a rounded blue tile with a white smiley face. */
function PetdexIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <rect x="1" y="1" width="14" height="14" rx="3.4" fill="currentColor" />
      <circle cx="5.3" cy="6" r="1.2" fill="#fff" />
      <circle cx="10.7" cy="6" r="1.2" fill="#fff" />
      <path
        d="M4.1 9.7c1.2 1.8 6.6 1.8 7.8 0"
        fill="none"
        stroke="#fff"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Render the desktop pet card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card, or nothing when the namespace is unavailable.
 */
export function DesktopPetCard(props: DesktopPetCardProps) {
  const { t } = props
  const state = props.useDesktopPet(s => s)
  const [open, setOpen] = useState(false)
  const [petdexOpen, setPetdexOpen] = useState(false)
  const [petdexSlug, setPetdexSlug] = useState('')

  if (!state.available) return null
  const title = t('desktopPet.title')
  const blocked = !state.dirty || state.invalid || state.saving
  const importDisabled = state.importing || !state.writable

  const confirmPetdex = () => {
    const slug = petdexSlug.trim()
    if (slug.length === 0 || importDisabled) return
    props.importFromPetdex(slug)
    setPetdexOpen(false)
    setPetdexSlug('')
  }

  return (
    <li className={clsx(css.card, open && css.cardOpen)}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${title}`}
        onClick={() => { setOpen(!open) }}
      >
        <span className={css.headText}>
          <span className={css.name}>{title}</span>
          <span className={css.description}>{t('desktopPet.description')}</span>
        </span>
        {state.dirty ? <span className={css.pending}>{t('unsaved')}</span> : null}
        <IconChevronDownOutline14 className={clsx(css.chevron, open && css.chevronOpen)} />
      </button>
      {open
        ? (
          <div className={css.body}>
            {!state.writable ? <p className={css.readOnly} role="status">{t('readOnly')}</p> : null}

            <ToggleField
              id="plugin-config-desktop-pet-enabled"
              label={t('desktopPet.enabled')}
              hint={t('desktopPet.enabledHint')}
              overriddenLabel={t('overridden')}
              resetLabel={t('reset')}
              disabled={!state.writable}
              checked={state.enabled.value}
              overridden={state.enabled.overridden}
              onChange={(value) => { props.edit('enabled', value) }}
              onReset={() => { props.resetField('enabled') }}
            />

            <ToggleField
              id="plugin-config-desktop-pet-hide-when-idle"
              label={t('desktopPet.hideWhenIdle')}
              hint={t('desktopPet.hideWhenIdleHint')}
              overriddenLabel={t('overridden')}
              resetLabel={t('reset')}
              disabled={!state.writable}
              checked={state.hideWhenIdle.value}
              overridden={state.hideWhenIdle.overridden}
              onChange={(value) => { props.edit('hideWhenIdle', value) }}
              onReset={() => { props.resetField('hideWhenIdle') }}
            />

            <ScaleField
              id="plugin-config-desktop-pet-scale"
              label={t('desktopPet.scale')}
              hint={t('desktopPet.scaleHint')}
              overriddenLabel={t('overridden')}
              resetLabel={t('reset')}
              disabled={!state.writable}
              value={state.petScale.value}
              overridden={state.petScale.overridden}
              onChange={(value) => { props.edit('petScale', value) }}
              onReset={() => { props.resetField('petScale') }}
            />

            <PetField
              id="plugin-config-desktop-pet-id"
              label={t('desktopPet.pet')}
              hint={t('desktopPet.petHint')}
              overriddenLabel={t('overridden')}
              resetLabel={t('reset')}
              disabled={!state.writable}
              value={state.petId.value}
              overridden={state.petId.overridden}
              pets={state.availablePets}
              onChange={(value) => { props.edit('petId', value) }}
              onReset={() => { props.resetField('petId') }}
              metaLink={(
                <a className={css.petMetaLink} href={ADD_PET_DOC_URL} target="_blank" rel="noreferrer">
                  {t('desktopPet.addPetLink')}
                </a>
              )}
            >
              <div className={css.importActions}>
                <button
                  type="button"
                  className={css.importButton}
                  disabled={importDisabled}
                  onClick={props.importFromFolder}
                >
                  <IconFolderOpen16 className={css.importIcon} />
                  {t('desktopPet.addFromFolder')}
                </button>
                <button
                  type="button"
                  className={css.importButton}
                  disabled={importDisabled}
                  onClick={() => { setPetdexOpen(v => !v) }}
                >
                  <PetdexIcon className={css.importIcon} />
                  {t('desktopPet.addFromPetdex')}
                </button>
              </div>

              {petdexOpen && !state.importing
                ? (
                  <div className={css.petdexRow}>
                    <Input
                      className={css.petdexInput}
                      placeholder={t('desktopPet.petdexSlugPlaceholder')}
                      value={petdexSlug}
                      onChange={(event) => { setPetdexSlug(event.target.value) }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') confirmPetdex()
                        if (event.key === 'Escape') setPetdexOpen(false)
                      }}
                      autoFocus
                    />
                    <div className={css.petdexButtons}>
                      <button
                        type="button"
                        className={css.discard}
                        onClick={() => { setPetdexOpen(false) }}
                      >
                        {t('desktopPet.petdexCancel')}
                      </button>
                      <button
                        type="button"
                        className={css.save}
                        disabled={petdexSlug.trim().length === 0}
                        onClick={confirmPetdex}
                      >
                        {t('desktopPet.petdexConfirm')}
                      </button>
                    </div>
                  </div>
                )
                : null}

              {state.importing
                ? <p className={css.importResult} role="status">{t('desktopPet.importing')}</p>
                : null}
              {state.importMessage
                ? <ImportResultRow message={state.importMessage} onClose={props.clearImportMessage} t={t} />
                : null}
            </PetField>

            <div className={css.footer}>
              {state.failed ? <p className={css.failed} role="status">{t('saveFailed')}</p> : null}
              <button
                type="button"
                className={css.discard}
                disabled={!state.dirty || state.saving}
                onClick={props.discard}
              >
                {t('discard')}
              </button>
              <button
                type="button"
                className={css.save}
                disabled={blocked}
                onClick={props.save}
              >
                {t(state.saving ? 'saving' : 'save')}
              </button>
            </div>
          </div>
        )
        : null}
    </li>
  )
}

/** The import outcome row: localized copy plus a dismiss affordance. */
function ImportResultRow(props: {
  message: ImportMessage
  onClose: () => void
  t: (key: DesktopPetKey) => string
}) {
  const key = IMPORT_COPY[props.message.code] ?? 'desktopPet.importFailed'
  return (
    <p
      className={clsx(css.importResult, props.message.ok ? css.importResultOk : css.importResultError)}
      role="status"
    >
      <span className={css.importResultText}>{props.t(key)}</span>
      <button
        type="button"
        className={css.importClose}
        onClick={props.onClose}
        aria-label={props.t('discard')}
      >
        ✕
      </button>
    </p>
  )
}

interface FieldChromeProps {
  id: string
  label: string
  hint: string
  overriddenLabel: string
  resetLabel: string
  disabled: boolean
  overridden: boolean
  onReset: () => void
  children: React.ReactNode
}

/** Shared field chrome: label + override/reset badges, control, hint. */
function FieldChrome(props: FieldChromeProps) {
  return (
    <div className={css.field}>
      <div className={css.head}>
        <label className={css.label} htmlFor={props.id}>{props.label}</label>
        {props.overridden
          ? (
            <span className={css.badges}>
              <span className={css.badge}>{props.overriddenLabel}</span>
              <button
                type="button"
                className={css.reset}
                disabled={props.disabled}
                onClick={props.onReset}
              >
                {props.resetLabel}
              </button>
            </span>
          )
          : null}
      </div>
      {props.children}
      <p className={css.hint}>{props.hint}</p>
    </div>
  )
}

/** The show/hide toggle. */
function ToggleField(props: {
  id: string
  label: string
  hint: string
  overriddenLabel: string
  resetLabel: string
  disabled: boolean
  checked: boolean
  overridden: boolean
  onChange: (value: boolean) => void
  onReset: () => void
}) {
  return (
    <FieldChrome {...props}>
      <label className={css.switchRow}>
        <input
          id={props.id}
          type="checkbox"
          checked={props.checked}
          disabled={props.disabled}
          onChange={(event) => { props.onChange(event.target.checked) }}
        />
        <span className={css.switchTrack} aria-hidden="true">
          <span className={clsx(css.switchThumb, props.checked && css.switchThumbOn)} />
        </span>
      </label>
    </FieldChrome>
  )
}

/** The fractional size slider. */
function ScaleField(props: {
  id: string
  label: string
  hint: string
  overriddenLabel: string
  resetLabel: string
  disabled: boolean
  value: number
  overridden: boolean
  onChange: (value: number) => void
  onReset: () => void
}) {
  return (
    <FieldChrome {...props}>
      <div className={css.sliderRow}>
        <input
          id={props.id}
          type="range"
          min={PET_SCALE_MIN}
          max={PET_SCALE_MAX}
          step={PET_SCALE_STEP}
          value={props.value}
          disabled={props.disabled}
          onChange={(event) => { props.onChange(quantizeScale(Number(event.target.value))) }}
        />
        <span className={css.value}>{props.value.toFixed(2)}×</span>
      </div>
    </FieldChrome>
  )
}

/** The pet picker block: dropdown + import actions + hint/link line. */
function PetField(props: {
  id: string
  label: string
  hint: string
  overriddenLabel: string
  resetLabel: string
  disabled: boolean
  value: string
  overridden: boolean
  pets: ReadonlyArray<{ id: string; displayName: string }>
  onChange: (value: string) => void
  onReset: () => void
  metaLink?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className={css.field}>
      <div className={css.head}>
        <label className={css.label} htmlFor={props.id}>{props.label}</label>
        {props.overridden
          ? (
            <span className={css.badges}>
              <span className={css.badge}>{props.overriddenLabel}</span>
              <button
                type="button"
                className={css.reset}
                disabled={props.disabled}
                onClick={props.onReset}
              >
                {props.resetLabel}
              </button>
            </span>
          )
          : null}
      </div>
      <select
        id={props.id}
        className={css.select}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => { props.onChange(event.target.value) }}
      >
        {props.pets.map(pet => (
          <option key={pet.id} value={pet.id}>{pet.displayName}</option>
        ))}
      </select>
      {props.children}
      <p className={css.petMeta}>
        <span className={css.petMetaText}>{props.hint}</span>
        {props.metaLink}
      </p>
    </div>
  )
}
