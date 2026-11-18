import test from 'node:test'
import assert from 'node:assert/strict'
import { CLIENT_PRESENTATION_PRELUDE, resolveVisionModePair } from '../lib/client-presentation-boundary.js'
import { hardenVisionClientSource } from '../lib/vision-toggle-root-hardening.js'

test('autoVisionProviders matching is present in the shipped prelude and survives hardening', () => {
  for (const source of [CLIENT_PRESENTATION_PRELUDE, hardenVisionClientSource(CLIENT_PRESENTATION_PRELUDE)]) {
    assert.ok(source.includes('function visionModeAutoEnabled'), 'matcher helper is shipped')
    assert.ok(source.includes('visionModeAutoEnabled(visionConfig, cur.provider, cur.model)'), 'toggle uses the matcher')
    assert.ok(source.includes('props.select(target)'), 'auto-enable uses the same select path as a manual click')
  }
})

test('matching a listed source model points at its owned vision twin', () => {
  const groups = [
    { id: 'workbuddy-global', name: 'WorkBuddy Global', models: [{ id: 'hy4flash-free', name: 'hy4flash-free' }] },
    { id: 'workbuddy-global-vision', name: 'WorkBuddy Global + 自动识图', models: [{ id: 'hy4flash-free', name: 'hy4flash-free' }] },
  ]
  const config = { autoVisionProviders: [{ provider: 'workbuddy-global', models: ['hy4flash-free'] }] }
  const pair = resolveVisionModePair(groups, { provider: 'workbuddy-global', model: 'hy4flash-free' }, config)
  assert.equal(pair.mode, 'off', 'source route is off before auto-enable runs')
  assert.equal(pair.target.provider, 'workbuddy-global-vision', 'auto-enable target is the vision twin')
})
