import test from 'node:test'
import assert from 'node:assert/strict'

import { Config } from '../index.js'
import {
  projectVisionModeDirectoryState,
} from '../lib/vision-model-visibility-boundary.js'
import { resolveVisionModePair } from '../lib/client-presentation-boundary.js'
import {
  MAX_RUNTIME_WRAPPED_PROVIDER_ROWS,
  normalizeRuntimeVisionConfig,
  runtimeConfigFieldBudgetError,
} from '../lib/runtime-config-normalizer.js'
import { SETTINGS_IA_CLIENT_PRELUDE } from '../lib/settings-ia-client-prelude.js'
import { SETTINGS_NATIVE_CARD_IA_PRELUDE } from '../lib/settings-native-card-layout.js'

function model(id, name = id) {
  return { id, name }
}

function group(id, name, modelIds) {
  return { id, name, models: modelIds.map((id) => model(id)) }
}

function state({ current, groups, status = 'ready', error = null, failures = [], routable = true }) {
  return { current, groups, status, error, failures, routable }
}

test('an autoVisionProviders row keeps the generated twin owned with autoWrapProviders off', () => {
  const groups = [
    group('opencode-go', 'OpenCode Go', ['qwen3.6-plus', 'minimax-m2.7']),
    group('opencode-go-vision', 'OpenCode Go + 自动识图', ['qwen3.6-plus', 'minimax-m2.7']),
  ]
  const config = {
    autoWrapProviders: false,
    autoVisionProviders: [{ provider: 'opencode-go', models: [] }],
  }
  assert.deepEqual(resolveVisionModePair(groups, {
    provider: 'opencode-go-vision',
    model: 'qwen3.6-plus',
  }, config), {
    mode: 'on',
    target: { provider: 'opencode-go', model: 'qwen3.6-plus' },
  })
})

test('an autoVisionProviders model filter narrows twin ownership the same way', () => {
  const groups = [
    group('opencode-go', 'OpenCode Go', ['qwen3.6-plus', 'minimax-m2.7']),
    group('opencode-go-vision', 'OpenCode Go + 自动识图', ['qwen3.6-plus', 'minimax-m2.7']),
  ]
  const config = {
    autoWrapProviders: false,
    autoVisionProviders: [{ provider: 'opencode-go', models: ['qwen3.6-plus'] }],
  }
  assert.deepEqual(resolveVisionModePair(groups, {
    provider: 'opencode-go-vision',
    model: 'qwen3.6-plus',
  }, config).mode, 'on')
  assert.deepEqual(resolveVisionModePair(groups, {
    provider: 'opencode-go-vision',
    model: 'minimax-m2.7',
  }, config).mode, 'unavailable')
})

test('without an auto row or autoWrap the twin stays unowned', () => {
  const groups = [
    group('opencode-go', 'OpenCode Go', ['qwen3.6-plus']),
    group('opencode-go-vision', 'OpenCode Go + 自动识图', ['qwen3.6-plus']),
  ]
  assert.deepEqual(resolveVisionModePair(groups, {
    provider: 'opencode-go-vision',
    model: 'qwen3.6-plus',
  }, { autoWrapProviders: false }), { mode: 'unavailable' })
})

test('projectVisionModeDirectoryState hides a twin materialized only by an auto row', () => {
  const input = state({
    current: { provider: 'opencode-go-vision', model: 'qwen3.6-plus' },
    groups: [
      group('opencode-go', 'OpenCode Go', ['qwen3.6-plus']),
      group('opencode-go-vision', 'OpenCode Go + 自动识图', ['qwen3.6-plus']),
    ],
  })
  const projected = projectVisionModeDirectoryState(input, {
    autoWrapProviders: false,
    autoVisionProviders: [{ provider: 'opencode-go', models: [] }],
  })
  assert.deepEqual(projected.groups.map((entry) => entry.id), ['opencode-go'])
  assert.equal(projected.current?.provider, 'opencode-go')
  assert.equal(projected.current?.model, 'qwen3.6-plus')
})

test('autoVisionProviders defaults to an empty list out of the box', () => {
  assert.deepEqual(Config({}).autoVisionProviders, [])
})

test('autoVisionProviders keeps the same row shape as wrappedProviders', () => {
  const parsed = Config({
    autoVisionProviders: [{ provider: 'opencode-go', models: ['qwen3.6-plus'] }],
  })
  assert.deepEqual(parsed.autoVisionProviders, [{ provider: 'opencode-go', models: ['qwen3.6-plus'] }])
  const bare = Config({ autoVisionProviders: [{ provider: 'opencode-go' }] })
  assert.deepEqual(bare.autoVisionProviders, [{ provider: 'opencode-go', models: [] }])
})

test('normalizeRuntimeVisionConfig normalizes autoVisionProviders like wrappedProviders', () => {
  const normalized = normalizeRuntimeVisionConfig({
    autoVisionProviders: [{ provider: 'opencode-go', models: ['qwen3.6-plus'] }, { provider: 'bogus' }],
  })
  assert.deepEqual(normalized.autoVisionProviders, [{ provider: 'opencode-go', models: ['qwen3.6-plus'] }])
})

test('runtimeConfigFieldBudgetError bounds autoVisionProviders rows', () => {
  const rows = Array.from({ length: MAX_RUNTIME_WRAPPED_PROVIDER_ROWS + 1 }, (_, index) => ({
    provider: 'p' + index,
    models: [],
  }))
  const error = runtimeConfigFieldBudgetError('autoVisionProviders', rows)
  assert.ok(typeof error === 'string')
  assert.match(error, /autoVisionProviders/)
  assert.match(error, /at most/)
})

test('settings prelude ships the auto-vision editor alongside the wrapped-providers editor', () => {
  assert.ok(SETTINGS_IA_CLIENT_PRELUDE.includes('哪些聊天模型自动开启识图'))
  assert.ok(SETTINGS_IA_CLIENT_PRELUDE.includes('Which chat models auto-enable Vision mode'))
  assert.ok(SETTINGS_IA_CLIENT_PRELUDE.includes('autoWrappersEditor'))
  assert.ok(SETTINGS_IA_CLIENT_PRELUDE.includes('wrappersEditor(),autoWrappersEditor()'))
})

test('native card layout tracks autoVisionProviders on the advanced page', () => {
  assert.ok(SETTINGS_NATIVE_CARD_IA_PRELUDE.includes('autoVisionProviders'))
  assert.ok(SETTINGS_NATIVE_CARD_IA_PRELUDE.includes('invalidAutoWrapperDraft'))
})

