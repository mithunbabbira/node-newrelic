/*
 * Copyright 2024 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const { Rule } = require('../../../../lib/otel/traces/rules')

describe('Rule canonical value support', function () {
  it('should match a span with canonical attribute_conditions { expected, value }', function () {
    const rule = new Rule({
      name: 'TestDbSqlite',
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
      attributes: []
    })

    const span1 = {
      instrumentationScope: {},
      attributes: { 'db.system': 'sqlite3' }
    }
    const span2 = {
      instrumentationScope: {},
      attributes: { 'db.system': 'better-sqlite3' }
    }
    const span3 = {
      instrumentationScope: {},
      attributes: { 'db.system': 'node:sqlite' }
    }
    const span4 = {
      instrumentationScope: {},
      attributes: { 'db.system': 'postgresql' }
    }

    assert.strictEqual(rule.matches(span1), true)
    assert.strictEqual(rule.matches(span2), true)
    assert.strictEqual(rule.matches(span3), true)
    assert.strictEqual(rule.matches(span4), false)
  })

  it('getCanonicalValue should return the canonical value for a matched key', function () {
    const rule = new Rule({
      name: 'TestDbSqlite',
      type: 'db',
      matcher: {
        required_span_kinds: ['client'],
        required_attribute_keys: ['db.system'],
        attribute_conditions: {
          'db.system': {
            expected: ['sqlite3', 'better-sqlite3'],
            value: 'sqlite'
          }
        }
      },
      attributes: []
    })

    assert.strictEqual(rule.getCanonicalValue('db.system'), 'sqlite')
    assert.strictEqual(rule.getCanonicalValue('net.peer.name'), undefined)
  })

  it('should still support legacy array-based attribute_conditions', function () {
    const rule = new Rule({
      name: 'TestDbRedis',
      type: 'db',
      matcher: {
        required_span_kinds: ['client'],
        required_attribute_keys: ['db.system'],
        attribute_conditions: {
          'db.system': ['redis', 'memcached']
        }
      },
      attributes: []
    })

    const span1 = {
      instrumentationScope: {},
      attributes: { 'db.system': 'redis' }
    }
    const span2 = {
      instrumentationScope: {},
      attributes: { 'db.system': 'postgresql' }
    }

    assert.strictEqual(rule.matches(span1), true)
    assert.strictEqual(rule.matches(span2), false)
  })

  it('should still support legacy string equality attribute_conditions', function () {
    const rule = new Rule({
      name: 'TestScopeMatch',
      type: 'db',
      matcher: {
        required_span_kinds: ['client'],
        required_attribute_keys: ['db.system'],
        attribute_conditions: {
          'db.system': 'redis'
        }
      },
      attributes: []
    })

    const span1 = {
      instrumentationScope: {},
      attributes: { 'db.system': 'redis' }
    }
    const span2 = {
      instrumentationScope: {},
      attributes: { 'db.system': 'postgresql' }
    }

    assert.strictEqual(rule.matches(span1), true)
    assert.strictEqual(rule.matches(span2), false)
  })
})
