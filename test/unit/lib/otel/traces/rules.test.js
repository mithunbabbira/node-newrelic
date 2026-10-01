/*
 * Copyright 2024 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

// Based upon https://github.com/open-telemetry/opentelemetry-js/blob/8fc76896595aac912bf9e15d4f19c167317844c8/packages/opentelemetry-sdk-trace-base/test/common/Span.test.ts#L851

const test = require('node:test')
const assert = require('node:assert')

const { ROOT_CONTEXT, SpanKind } = require('@opentelemetry/api')
const { BasicTracerProvider } = require('@opentelemetry/sdk-trace-base')
const { RulesEngine } = require('#agentlib/otel/traces/rules.js')

const tracer = new BasicTracerProvider().getTracer('default')

test('engine returns correct matching rule', () => {
  const engine = new RulesEngine()
  const span = tracer.startSpan('test-span', { kind: SpanKind.SERVER }, ROOT_CONTEXT)
  span.setAttribute('http.request.method', 'GET')
  span.end()

  const rule = engine.test(span)
  assert.notEqual(rule, undefined)
  assert.equal(rule.name, 'OtelHttpServer1_23')
})

test('consumer does not match fallback rule', () => {
  const engine = new RulesEngine()
  const span = tracer.startSpan('test-span', { kind: SpanKind.CONSUMER }, ROOT_CONTEXT)
  span.setAttribute('messaging.operation', 'create')
  span.setAttribute('messaging.system', 'rabbitmq')
  span.setAttribute('messaging.destination.name', 'test-queue')
  span.end()

  const rule = engine.test(span)
  assert.notEqual(rule, undefined)
  assert.equal(rule.name, 'OtelMessagingConsumer1_24')
})

test('consumer matches fallback rule', () => {
  const engine = new RulesEngine()
  const span = tracer.startSpan('test-span', { kind: SpanKind.CONSUMER }, ROOT_CONTEXT)
  span.end()

  const rule = engine.test(span)
  assert.notEqual(rule, undefined)
  assert.equal(rule.name, 'FallbackConsumer')
})

test('fallback server rule is met', () => {
  const engine = new RulesEngine()
  const span = tracer.startSpan('test-span', { kind: SpanKind.SERVER }, ROOT_CONTEXT)
  span.setAttribute('foo.bar', 'baz')
  span.end()

  const rule = engine.test(span)
  assert.notEqual(rule, undefined)
  assert.equal(rule.name, 'FallbackServer')
})

test('fallback client rule is met', () => {
  const engine = new RulesEngine()
  const span = tracer.startSpan('test-span', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span.setAttribute('foo.bar', 'baz')
  span.end()

  const rule = engine.test(span)
  assert.notEqual(rule, undefined)
  assert.equal(rule.name, 'FallbackClient')
})

test('fallback producer rule is met', () => {
  const engine = new RulesEngine()
  const span = tracer.startSpan('test-span', { kind: SpanKind.PRODUCER }, ROOT_CONTEXT)
  span.setAttribute('foo.bar', 'baz')
  span.end()

  const rule = engine.test(span)
  assert.notEqual(rule, undefined)
  assert.equal(rule.name, 'FallbackProducer')
})

test('fallback internal rule is met', () => {
  const engine = new RulesEngine()
  const span = tracer.startSpan('test-span', { kind: SpanKind.INTERNAL }, ROOT_CONTEXT)
  span.setAttribute('foo.bar', 'baz')
  span.end()

  const rule = engine.test(span)
  assert.notEqual(rule, undefined)
  assert.equal(rule.name, 'Fallback')
})

test('scope_name rule is met', () => {
  const engine = new RulesEngine()
  const span = tracer.startSpan('test-span', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span.setAttribute('db.system.name', 'postgresql')
  span.instrumentationScope = { name: 'prisma' }
  span.end()

  const rule = engine.test(span)
  assert.notEqual(rule, undefined)
  assert.equal(rule.name, 'OtelDbClientPrisma1_40')
})

test('scope_version matching rule is met', () => {
  const rule = {
    name: 'test-rule',
    type: 'db',
    matcher: {
      required_span_kinds: ['client'],
      required_attribute_keys: ['db.system'],
      scope_version: '^1.0.0'
    },
    attributes: [{
      key: 'db.system',
      target: 'segment',
      name: 'product'
    }]
  }
  const engine = new RulesEngine({ rules: [rule] })
  const span = tracer.startSpan('test-span', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span.setAttribute('db.system', 'test-db')
  span.instrumentationScope = { version: '1.2.3' }
  span.end()

  const foundRule = engine.test(span)
  assert.notEqual(foundRule, undefined)
  assert.equal(foundRule.name, rule.name)
})

test('scope_version does not satisfy', () => {
  const rule = {
    name: 'test-rule',
    type: 'db',
    matcher: {
      required_span_kinds: ['client'],
      required_attribute_keys: ['db.system'],
      scope_version: '^1.0.0'
    },
    attributes: [{
      key: 'db.system',
      target: 'segment',
      name: 'product'
    }]
  }
  const engine = new RulesEngine({ rules: [rule] })
  const span = tracer.startSpan('test-span', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span.setAttribute('db.system', 'test-db')
  span.instrumentationScope = { version: '2.0.0' }
  span.end()

  const foundRule = engine.test(span)
  assert.equal(foundRule, undefined)
})

test('canonical value mapping in attribute_conditions matches expected values', () => {
  const rule = {
    name: 'test-sqlite-canonical',
    type: 'db',
    matcher: {
      required_span_kinds: ['client'],
      required_attribute_keys: ['db.system'],
      attribute_conditions: {
        'db.system': {
          expected: ['sqlite3', 'better-sqlite3', 'node:sqlite'],
          value: 'sqlite'
        }
      }
    },
    attributes: [{
      key: 'db.system',
      target: 'segment',
      name: 'product'
    }]
  }
  const engine = new RulesEngine({ rules: [rule] })

  // Test matching "sqlite3"
  let span = tracer.startSpan('test-span', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span.setAttribute('db.system', 'sqlite3')
  span.end()
  let foundRule = engine.test(span)
  assert.notEqual(foundRule, undefined)
  assert.equal(foundRule.name, 'test-sqlite-canonical')

  // Test matching "better-sqlite3"
  span = tracer.startSpan('test-span', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span.setAttribute('db.system', 'better-sqlite3')
  span.end()
  foundRule = engine.test(span)
  assert.notEqual(foundRule, undefined)

  // Test matching "node:sqlite"
  span = tracer.startSpan('test-span', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span.setAttribute('db.system', 'node:sqlite')
  span.end()
  foundRule = engine.test(span)
  assert.notEqual(foundRule, undefined)

  // Test non-matching value
  span = tracer.startSpan('test-span', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span.setAttribute('db.system', 'postgresql')
  span.end()
  foundRule = engine.test(span)
  assert.equal(foundRule, undefined)
})

test('getCanonicalValue resolves mapping for matching attribute values', () => {
  const rule = {
    name: 'test-sqlite-canonical',
    type: 'db',
    matcher: {
      required_span_kinds: ['client'],
      required_attribute_keys: ['db.system'],
      attribute_conditions: {
        'db.system': {
          expected: ['sqlite3', 'better-sqlite3', 'node:sqlite'],
          value: 'sqlite'
        }
      }
    }
  }
  const engine = new RulesEngine({ rules: [rule] })

  const span = tracer.startSpan('test-span', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span.setAttribute('db.system', 'better-sqlite3')
  span.end()
  const foundRule = engine.test(span)

  assert.equal(foundRule.getCanonicalValue('db.system', 'sqlite3'), 'sqlite')
  assert.equal(foundRule.getCanonicalValue('db.system', 'better-sqlite3'), 'sqlite')
  assert.equal(foundRule.getCanonicalValue('db.system', 'node:sqlite'), 'sqlite')
  assert.equal(foundRule.getCanonicalValue('db.system', 'postgresql'), null)
})

test('canonical value mapping does not interfere with array-based conditions', () => {
  const rule = {
    name: 'test-db-array',
    type: 'db',
    matcher: {
      required_span_kinds: ['client'],
      required_attribute_keys: ['db.system'],
      attribute_conditions: {
        'db.system': ['postgresql', 'mysql']
      }
    }
  }
  const engine = new RulesEngine({ rules: [rule] })

  let span = tracer.startSpan('test-span', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span.setAttribute('db.system', 'postgresql')
  span.end()
  assert.equal(engine.test(span)?.name, 'test-db-array')

  span = tracer.startSpan('test-span', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span.setAttribute('db.system', 'mysql')
  span.end()
  assert.equal(engine.test(span)?.name, 'test-db-array')

  span = tracer.startSpan('test-span', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span.setAttribute('db.system', 'sqlite3')
  span.end()
  assert.equal(engine.test(span), undefined)
})
