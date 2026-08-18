/**
 * The describe-image settings card: the vision endpoint (base URL, model,
 * key reference), the default instruction, and the call bounds. Registers
 * into the `web-ui.plugin.item` slot the Web UI Plugins group renders,
 * bound to the `describe-image` settings namespace through the family
 * settings bridge (or the official settings scope when the deployment
 * exposes the namespace directly).
 * @module @linxin666/dsh-tool-describe-image/client/DescribeImageSettingsCard
 */

import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { PluginSettingsCard, ChoiceField, ValueField } from './PluginSettingsCard.tsx'
import { CardForm, choiceField, numberField, secretField, textField, type CardActions, type CardShell, type FieldState as CardFieldState } from './settings-form.ts'
import { t } from './locales.ts'
import css from './settings-card.module.css'

/** The describe-image fields this card edits (the namespace's full schema). */
export interface DescribeImageSettings {
  baseURL?: string
  model?: string
  apiKey?: string
  apiKeyEnv?: string
  defaultPrompt?: string
  maxBytes?: number
  maxOutputTokens?: number
  timeoutMs?: number
  apiStyle?: 'chat-completions' | 'responses'
}

/** One discovered model item. */
export interface DiscoveredModel {
  id: string
  isVisionRecommended: boolean
}

/** What the describe-image card renders. */
export interface DescribeImageSettingsCardState extends CardShell {
  baseURL: CardFieldState
  model: CardFieldState
  apiKey: CardFieldState
  apiKeyEnv: CardFieldState
  defaultPrompt: CardFieldState
  maxBytes: CardFieldState
  maxOutputTokens: CardFieldState
  timeoutMs: CardFieldState
  apiStyle: CardFieldState
}

/** The registration-side face the card's slot entry injects. */
export interface DescribeImageSettingsCardFace extends CardActions {
  hooks: {
    /** Card snapshot bound by the renderer as useDescribeImageSettingsCard. */
    describeImageSettingsCard: SnapshotStore<DescribeImageSettingsCardState>
  }
}

/** Bridges the `describe-image` scope onto the card's staged form. */
export class DescribeImageSettingsCardController {
  private readonly form: CardForm<DescribeImageSettings>
  private readonly store: SnapshotStore<DescribeImageSettingsCardState>

  /** @param scope - the bound settings scope for the `describe-image` namespace. */
  constructor(scope: SettingsScope<DescribeImageSettings>) {
    this.form = new CardForm(scope, [
      textField('baseURL'),
      textField('model'),
      choiceField('apiStyle', ['chat-completions', 'responses']),
      secretField('apiKey'),
      textField('apiKeyEnv'),
      textField('defaultPrompt'),
      numberField('maxBytes'),
      numberField('maxOutputTokens'),
      numberField('timeoutMs'),
    ], ['apiKey'])
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): DescribeImageSettingsCardState {
    return {
      ...this.form.shell(),
      baseURL: this.form.field('baseURL'),
      model: this.form.field('model'),
      apiStyle: this.form.field('apiStyle'),
      apiKey: this.form.field('apiKey'),
      apiKeyEnv: this.form.field('apiKeyEnv'),
      defaultPrompt: this.form.field('defaultPrompt'),
      maxBytes: this.form.field('maxBytes'),
      maxOutputTokens: this.form.field('maxOutputTokens'),
      timeoutMs: this.form.field('timeoutMs'),
    }
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject(): DescribeImageSettingsCardFace {
    return { hooks: { describeImageSettingsCard: this.store }, ...this.form.actions() }
  }
}

/** Props the renderer binds for the describe-image card. */
export type DescribeImageSettingsCardProps =
  PropsRuntime<'web-ui.plugin.item'>
  & InjectFace<DescribeImageSettingsCardFace>

function IconRefresh({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M2.5 8C2.5 4.96243 4.96243 2.5 8 2.5C10.3556 2.5 12.3571 3.97899 13.1444 6.06667M13.5 8C13.5 11.0376 11.0376 13.5 8 13.5C5.64444 13.5 3.64293 12.021 2.85561 9.93333" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M13.5 3.5V6.5H10.5M2.5 12.5V9.5H5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconZap({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M8.5 1.5L2.5 9H8L7.5 14.5L13.5 7H8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function extractErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>
    if (typeof obj['message'] === 'string') return obj['message']
    if (typeof obj['error'] === 'string') return obj['error']
    if (typeof obj['error'] === 'object' && obj['error'] !== null && typeof (obj['error'] as Record<string, unknown>)['message'] === 'string') {
      return (obj['error'] as Record<string, unknown>)['message'] as string
    }
    try {
      return JSON.stringify(err)
    } catch {
      return '未知错误'
    }
  }
  return String(err || '未知错误')
}

/**
 * Render the describe-image card.
 * @param props - the card snapshot and its form actions.
 * @returns the card.
 */
export function DescribeImageSettingsCard(props: DescribeImageSettingsCardProps) {
  const state = props.useDescribeImageSettingsCard(snapshot => snapshot)
  const disabled = !state.writable

  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [modelFetchFeedback, setModelFetchFeedback] = useState<{ text: string; error?: boolean } | null>(null)

  const [testingConnection, setTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const fieldProps = {
    overriddenLabel: t('settings.overridden'),
    resetLabel: t('settings.reset'),
    invalidLabel: t('settings.invalidNumber'),
    disabled,
  }

  const effectiveBaseURL = state.baseURL.text || ''
  const effectiveModel = state.model.text || ''
  const effectiveApiKey = state.apiKey.text || ''
  const effectiveApiKeyEnv = state.apiKeyEnv.text || ''
  const effectiveApiStyle = state.apiStyle.text || 'chat-completions'
  const effectiveTimeoutMs = state.timeoutMs.text ? parseInt(state.timeoutMs.text, 10) : 15000

  const handleFetchModels = async () => {
    if (!effectiveBaseURL.trim()) {
      setModelFetchFeedback({ text: t('test.needBaseURL'), error: true })
      return
    }
    setFetchingModels(true)
    setModelFetchFeedback(null)
    try {
      const res = await fetch('/describe-image/discover-models', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          baseURL: effectiveBaseURL.trim(),
          apiKey: effectiveApiKey.trim() || undefined,
          apiKeyEnv: effectiveApiKeyEnv.trim() || undefined,
        }),
      })
      const data = (await res.json()) as { ok: boolean; models?: DiscoveredModel[]; error?: unknown }
      if (data.ok && Array.isArray(data.models)) {
        setDiscoveredModels(data.models)
        if (data.models.length === 0) {
          setModelFetchFeedback({ text: t('field.model.fetchEmpty'), error: true })
        } else {
          setModelFetchFeedback({ text: t('field.model.fetchSuccess', { count: data.models.length }) })
        }
      } else {
        const msg = extractErrorMessage(data.error)
        setModelFetchFeedback({ text: t('field.model.fetchError', { error: msg }), error: true })
      }
    } catch (err) {
      setModelFetchFeedback({ text: t('field.model.fetchError', { error: extractErrorMessage(err) }), error: true })
    } finally {
      setFetchingModels(false)
    }
  }

  const handleTestConnection = async () => {
    if (!effectiveBaseURL.trim()) {
      setTestResult({ ok: false, message: t('test.needBaseURL') })
      return
    }
    if (!effectiveModel.trim()) {
      setTestResult({ ok: false, message: t('test.needModel') })
      return
    }
    setTestingConnection(true)
    setTestResult(null)
    try {
      const res = await fetch('/describe-image/test-connection', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          baseURL: effectiveBaseURL.trim(),
          model: effectiveModel.trim(),
          apiKey: effectiveApiKey.trim() || undefined,
          apiKeyEnv: effectiveApiKeyEnv.trim() || undefined,
          apiStyle: effectiveApiStyle,
          timeoutMs: effectiveTimeoutMs,
        }),
      })
      const data = (await res.json()) as { ok: boolean; latencyMs?: number; error?: unknown }
      if (data.ok) {
        setTestResult({ ok: true, message: t('test.success', { latency: data.latencyMs ?? 0 }) })
      } else {
        setTestResult({ ok: false, message: t('test.error', { error: extractErrorMessage(data.error) }) })
      }
    } catch (err) {
      setTestResult({ ok: false, message: t('test.error', { error: extractErrorMessage(err) }) })
    } finally {
      setTestingConnection(false)
    }
  }

  const recommendedModels = discoveredModels.filter(m => m.isVisionRecommended)
  const otherModels = discoveredModels.filter(m => !m.isVisionRecommended)

  const footerExtra = (
    <div className={css.testSection}>
      <button
        type="button"
        className={css.testBtn}
        disabled={disabled || testingConnection}
        onClick={handleTestConnection}
      >
        {testingConnection ? <span className={css.spinner} /> : <IconZap />}
        {testingConnection ? t('test.testing') : t('test.button')}
      </button>
      {testResult && (
        <span className={`${css.testStatus} ${testResult.ok ? css.testStatusSuccess : css.testStatusError}`}>
          {testResult.ok ? '🟢 ' : '🔴 '}
          {testResult.message}
        </span>
      )}
    </div>
  )

  return (
    <PluginSettingsCard
      t={t}
      titleKey="card.title"
      descriptionKey="card.description"
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
      footerExtra={footerExtra}
    >
      <ValueField
        id="settings-describe-image-baseurl"
        label={t('field.baseURL')}
        hint={t('field.baseURL.hint')}
        placeholder="https://api.example.com/v1"
        {...fieldProps}
        {...state.baseURL}
        onEdit={(text) => { props.edit('baseURL', text) }}
        onReset={() => { props.resetField('baseURL') }}
      />
      <div className={css.field}>
        <div className={css.head}>
          <label htmlFor="settings-describe-image-model" className={css.label}>{t('field.model')}</label>
          <div className={css.badges}>
            {state.model.overridden ? <span className={css.badge}>{t('settings.overridden')}</span> : null}
            {state.model.overridden && !disabled ? (
              <button
                type="button"
                className={css.reset}
                onClick={() => { props.resetField('model') }}
              >
                {t('settings.reset')}
              </button>
            ) : null}
          </div>
        </div>
        <div className={css.modelRow}>
          <input
            id="settings-describe-image-model"
            type="text"
            className={css.input}
            disabled={disabled}
            placeholder={t('field.model.hint')}
            value={state.model.text}
            onChange={(e) => { props.edit('model', e.target.value) }}
          />
          <button
            type="button"
            className={css.fetchBtn}
            disabled={disabled || fetchingModels}
            onClick={handleFetchModels}
            title={t('field.model.fetch')}
          >
            {fetchingModels ? <span className={css.spinner} /> : <IconRefresh />}
            {fetchingModels ? t('field.model.fetching') : t('field.model.fetch')}
          </button>
        </div>
        {discoveredModels.length > 0 && (
          <select
            className={css.select}
            disabled={disabled}
            value={discoveredModels.some(m => m.id === state.model.text) ? state.model.text : ''}
            onChange={(e) => {
              if (e.target.value) props.edit('model', e.target.value)
            }}
          >
            <option value="" disabled>-- {t('field.model.fetchSuccess', { count: discoveredModels.length })} --</option>
            {recommendedModels.length > 0 && (
              <optgroup label={t('field.model.recommended')}>
                {recommendedModels.map(m => (
                  <option key={m.id} value={m.id}>✨ {m.id}</option>
                ))}
              </optgroup>
            )}
            {otherModels.length > 0 && (
              <optgroup label={t('field.model.other')}>
                {otherModels.map(m => (
                  <option key={m.id} value={m.id}>{m.id}</option>
                ))}
              </optgroup>
            )}
          </select>
        )}
        {modelFetchFeedback && (
          <p className={modelFetchFeedback.error ? css.invalid : css.hint} role="status">
            {modelFetchFeedback.text}
          </p>
        )}
        <p className={css.hint}>{t('field.model.hint')}</p>
      </div>
      <ChoiceField
        id="settings-describe-image-apistyle"
        label={t('field.apiStyle')}
        hint={t('field.apiStyle.hint')}
        inheritLabel={t('settings.inherit')}
        choices={[
          { value: 'chat-completions', label: t('field.apiStyle.chatCompletions') },
          { value: 'responses', label: t('field.apiStyle.responses') },
        ]}
        {...fieldProps}
        {...state.apiStyle}
        onEdit={(text) => { props.edit('apiStyle', text) }}
        onReset={() => { props.resetField('apiStyle') }}
      />
      <ValueField
        id="settings-describe-image-apikey"
        label={t('field.apiKey')}
        hint={t('field.apiKey.hint')}
        placeholder="sk-..."
        {...fieldProps}
        {...state.apiKey}
        onEdit={(text) => { props.edit('apiKey', text) }}
        onReset={() => { props.resetField('apiKey') }}
      />
      <ValueField
        id="settings-describe-image-apikeyenv"
        label={t('field.apiKeyEnv')}
        hint={t('field.apiKeyEnv.hint')}
        placeholder="VISION_API_KEY"
        {...fieldProps}
        {...state.apiKeyEnv}
        onEdit={(text) => { props.edit('apiKeyEnv', text) }}
        onReset={() => { props.resetField('apiKeyEnv') }}
      />
      <ValueField
        id="settings-describe-image-defaultprompt"
        label={t('field.defaultPrompt')}
        hint={t('field.defaultPrompt.hint')}
        {...fieldProps}
        {...state.defaultPrompt}
        onEdit={(text) => { props.edit('defaultPrompt', text) }}
        onReset={() => { props.resetField('defaultPrompt') }}
      />
      <ValueField
        id="settings-describe-image-maxbytes"
        label={t('field.maxBytes')}
        hint={t('field.maxBytes.hint')}
        numeric
        {...fieldProps}
        {...state.maxBytes}
        onEdit={(text) => { props.edit('maxBytes', text) }}
        onReset={() => { props.resetField('maxBytes') }}
      />
      <ValueField
        id="settings-describe-image-maxoutputtokens"
        label={t('field.maxOutputTokens')}
        hint={t('field.maxOutputTokens.hint')}
        numeric
        {...fieldProps}
        {...state.maxOutputTokens}
        onEdit={(text) => { props.edit('maxOutputTokens', text) }}
        onReset={() => { props.resetField('maxOutputTokens') }}
      />
      <ValueField
        id="settings-describe-image-timeoutms"
        label={t('field.timeoutMs')}
        hint={t('field.timeoutMs.hint')}
        numeric
        {...fieldProps}
        {...state.timeoutMs}
        onEdit={(text) => { props.edit('timeoutMs', text) }}
        onReset={() => { props.resetField('timeoutMs') }}
      />
    </PluginSettingsCard>
  )
}
