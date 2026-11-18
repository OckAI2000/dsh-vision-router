import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'

import {
  VISION_MODEL_VISIBILITY_PRELUDE,
  visionProjectionSourceProvider,
  projectVisionModeSelection,
} from '../lib/vision-model-visibility-boundary.js'

const UI_SESSION_TARGET = '@deepseek-ai/dsh-client-ui-session'

function selection(provider, model = 'hy4flash', reasoningEffort) {
  return {
    provider,
    model,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
  }
}

test('visionProjectionSourceProvider maps router-owned twins back to the source provider', () => {
  assert.equal(visionProjectionSourceProvider('workbuddy-vision', { autoWrapProviders: true }), 'workbuddy')
  assert.equal(visionProjectionSourceProvider('workbuddy-global-vision', { autoWrapProviders: true }), 'workbuddy-global')
  assert.equal(
    visionProjectionSourceProvider('workbuddy-vision', { autoWrapProviders: false, wrappedProviders: [{ provider: 'workbuddy' }] }),
    'workbuddy',
  )
  assert.equal(
    visionProjectionSourceProvider('workbuddy-vision', { autoWrapProviders: false, autoVisionProviders: [{ provider: 'workbuddy' }] }),
    'workbuddy',
  )
})

test('visionProjectionSourceProvider maps the DeepSeek wrapper and leaves foreign providers alone', () => {
  const config = { autoWrapProviders: true, wrapperRoute: 'deepseek-vision' }
  assert.equal(visionProjectionSourceProvider('deepseek-vision', config), 'deepseek-official')
  assert.equal(visionProjectionSourceProvider('workbuddy', config), undefined)
  assert.equal(visionProjectionSourceProvider('foo-vision-vision', config), undefined)
  assert.equal(visionProjectionSourceProvider('unknown-vision', { autoWrapProviders: false }), undefined)
  assert.equal(visionProjectionSourceProvider('', config), undefined)
})

test('projectVisionModeSelection rewrites both selection slots and preserves other fields', () => {
  const input = {
    next: selection('workbuddy-vision', 'hy4flash', 'high'),
    lastUsed: selection('workbuddy-global-vision', 'hy4flash-free'),
    extra: 'kept',
  }
  const output = projectVisionModeSelection(input, { autoWrapProviders: true })
  assert.equal(output.next.provider, 'workbuddy')
  assert.equal(output.next.model, 'hy4flash')
  assert.equal(output.next.reasoningEffort, 'high')
  assert.equal(output.lastUsed.provider, 'workbuddy-global')
  assert.equal(output.extra, 'kept')
  assert.equal(input.next.provider, 'workbuddy-vision', 'input value is not mutated')
})

test('projectVisionModeSelection is a no-op for ordinary providers and non-object values', () => {
  const value = { next: selection('workbuddy'), lastUsed: null }
  assert.equal(projectVisionModeSelection(value, { autoWrapProviders: true }), value)
  assert.equal(projectVisionModeSelection(undefined, { autoWrapProviders: true }), undefined)
  assert.equal(projectVisionModeSelection(null, { autoWrapProviders: true }), null)
})

function projectionHarness(config, initialValue) {
  let registered
  const loader = { load(spec) { registered = spec; return spec } }
  const context = {
    window: { __ModuleLoader__: loader },
    Object, Promise, Array, String, Map, Set, WeakMap, Math, JSON,
    setTimeout() { return 1 },
    clearTimeout() {},
  }
  vm.runInNewContext(VISION_MODEL_VISIBILITY_PRELUDE, context)

  const settings = {
    subscribe() { return () => {} },
    getSnapshot() { return { value: config } },
  }
  const rawFace = {
    value: initialValue ?? { next: selection('workbuddy-vision'), lastUsed: selection('workbuddy-vision'), marker: 1 },
    listeners: new Set(),
    getSnapshot() { return this.value },
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener) },
  }

  // Simulate Host's UiSession: materialize() returns keyedHooks.projection.
  class UiSession {
    constructor() {
      this.ctx = {
        settingsScope: {
          bind() { return settings },
        },
      }
    }
    materialize() {
      return {
        key: 'session-1',
        hooks: {},
        props: {},
        keyedHooks: {
          projection: (key) => key === 'modelSelection' ? rawFace : undefined,
        },
      }
    }
  }

  registered = null
  loader.load({
    id: UI_SESSION_TARGET,
    factory() {
      return { UiSession, apply() {} }
    },
  })

  const exports = registered.factory(() => { throw new Error('no host requires expected') })
  const instance = new exports.UiSession()
  const materialized = instance.materialize()
  return { face: materialized.keyedHooks.projection('modelSelection'), other: materialized.keyedHooks.projection('plan'), rawFace }
}

test('shipped prelude decorates ui-session projection face for modelSelection only', () => {
  assert.ok(VISION_MODEL_VISIBILITY_PRELUDE.includes('function patchUiSessionLoader'), 'ui-session patch is shipped')
  assert.ok(VISION_MODEL_VISIBILITY_PRELUDE.includes("UI_SESSION_TARGET = '@deepseek-ai/dsh-client-ui-session'"), 'target is the Host ui-session plugin')

  const { face, other, rawFace } = projectionHarness({ autoWrapProviders: true })
  assert.equal(face.getSnapshot().next.provider, 'workbuddy')
  assert.equal(face.getSnapshot().lastUsed.provider, 'workbuddy')
  assert.equal(face.getSnapshot().marker, 1)
  assert.equal(other, undefined, 'non-modelSelection projections are untouched')
  assert.equal(rawFace.value.next.provider, 'workbuddy-vision', 'authoritative store still holds the twin route')
})

test('projection face passes through foreign providers without rewriting', () => {
  const raw = { next: selection('trae'), lastUsed: selection('opencode-go'), marker: 2 }
  const { face } = projectionHarness({ autoWrapProviders: true }, raw)
  assert.equal(face.getSnapshot().next.provider, 'trae')
  assert.equal(face.getSnapshot().lastUsed.provider, 'opencode-go')
  assert.equal(face.getSnapshot(), face.getSnapshot(), 'projected snapshot is cached for identity stability')
})
